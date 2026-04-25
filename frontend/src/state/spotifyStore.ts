import { create } from "zustand";
import {
  beginSpotifyLogin,
  clearAuthCodeFromUrl,
  readAuthCodeFromUrl,
  takePkceVerifierOrThrow,
} from "../features/spotify/auth";
import { exchangeCodeForToken, refreshAccessToken } from "../features/spotify/tokenApi";
import { clearToken, isExpired, loadToken, saveToken, type SpotifyTokenSet } from "../features/spotify/tokenStorage";
import { loadWebPlaybackSdk, type SpotifyPlaybackState, type SpotifyPlayer } from "../features/spotify/webPlaybackSdk";

type PlayerTrack = {
  trackId: string | null;
  trackName: string;
  artist: string;
  uri: string;
};

type SpotifyStore = {
  token: SpotifyTokenSet | null;
  isAuthed: boolean;

  player: SpotifyPlayer | null;
  deviceId: string | null;
  isConnected: boolean;
  isReady: boolean;
  lastError: string | null;

  currentTrack: PlayerTrack | null;
  isPaused: boolean;

  login: () => Promise<void>;
  handleRedirectIfPresent: () => Promise<void>;
  logout: () => void;

  ensureValidToken: () => Promise<string>;
  initPlayer: () => Promise<void>;
  connectPlayer: () => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
};

function stateToTrack(s: SpotifyPlaybackState | null): PlayerTrack | null {
  if (!s) return null;
  const t = s.track_window.current_track;
  return {
    trackId: t.id,
    trackName: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    uri: t.uri,
  };
}

async function waitForDeviceId(
  getState: () => SpotifyStore,
  timeoutMs = 5000,
): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const id = getState().deviceId;
    if (id) return id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return getState().deviceId;
}

export const useSpotifyStore = create<SpotifyStore>((set, get) => ({
  token: loadToken(),
  isAuthed: !!loadToken(),

  player: null,
  deviceId: null,
  isConnected: false,
  isReady: false,
  lastError: null,

  currentTrack: null,
  isPaused: true,

  login: async () => {
    try {
      await beginSpotifyLogin();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ lastError: message });
      throw e;
    }
  },

  handleRedirectIfPresent: async () => {
    const hit = readAuthCodeFromUrl();
    if (!hit) return;

    try {
      const verifier = takePkceVerifierOrThrow(hit.state);
      const token = await exchangeCodeForToken(hit.code, verifier);
      saveToken(token);
      set({ token, isAuthed: true, lastError: null });
    } finally {
      clearAuthCodeFromUrl();
    }
  },

  logout: () => {
    clearToken();
    try {
      get().player?.disconnect();
    } catch {
      // ignore
    }
    set({
      token: null,
      isAuthed: false,
      player: null,
      deviceId: null,
      isConnected: false,
      isReady: false,
      currentTrack: null,
      isPaused: true,
      lastError: null,
    });
  },

  ensureValidToken: async () => {
    const token = get().token ?? loadToken();
    if (!token) throw new Error("Not authenticated with Spotify");
    if (!isExpired(token)) return token.access_token;

    if (!token.refresh_token) throw new Error("Missing Spotify refresh_token");
    const refreshed = await refreshAccessToken(token.refresh_token);
    saveToken(refreshed);
    set({ token: refreshed, isAuthed: true });
    return refreshed.access_token;
  },

  initPlayer: async () => {
    await get().handleRedirectIfPresent();
    await loadWebPlaybackSdk();

    const getOAuthToken = async (cb: (t: string) => void) => {
      try {
        const t = await get().ensureValidToken();
        cb(t);
      } catch (e) {
        set({ lastError: e instanceof Error ? e.message : String(e) });
      }
    };

    if (!window.Spotify?.Player) throw new Error("Spotify Web Playback SDK not available");

    const player = new window.Spotify.Player({
      name: "CogniShift SDK Player",
      getOAuthToken,
      volume: 0.8,
    });

    const onReady = (payload: { device_id: string }) => {
      set({ deviceId: payload.device_id, isReady: true, lastError: null });
    };
    const onNotReady = () => {
      set({ isReady: false, isConnected: false });
    };
    const onState = (s: SpotifyPlaybackState) => {
      set({ currentTrack: stateToTrack(s), isPaused: s.paused });
    };
    const onInitError = (e: { message: string }) => set({ lastError: e.message });
    const onAuthError = (e: { message: string }) => set({ lastError: e.message, isAuthed: false });
    const onAccountError = (e: { message: string }) => set({ lastError: e.message });
    const onPlaybackError = (e: { message: string }) => set({ lastError: e.message });

    player.addListener("ready", onReady);
    player.addListener("not_ready", onNotReady);
    player.addListener("player_state_changed", onState);
    player.addListener("initialization_error", onInitError);
    player.addListener("authentication_error", onAuthError);
    player.addListener("account_error", onAccountError);
    player.addListener("playback_error", onPlaybackError);

    set({ player });
  },

  connectPlayer: async () => {
    const { player } = get();
    if (!player) throw new Error("Player not initialized");
    const ok = await player.connect();
    set({ isConnected: ok });
    if (!ok) return;

    const deviceId = await waitForDeviceId(get);
    if (!deviceId) {
      set({
        lastError:
          "Spotify SDK connected, but the player device is not ready yet. Wait a moment and connect again.",
      });
      return;
    }

    const accessToken = await get().ensureValidToken();
    const transferRes = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_ids: [deviceId],
        play: true,
      }),
    });

    if (!transferRes.ok) {
      const detail = await transferRes.text().catch(() => "");
      set({
        lastError: `Connected, but failed to transfer playback (${transferRes.status})${detail ? `: ${detail}` : ""}`,
      });
      return;
    }

    // If user had no active playback context, transfer can succeed but state remains null
    // until playback starts from any client/device.
    set({ lastError: "Connected. If nothing starts, press play in Spotify once to seed playback." });
  },

  togglePlay: async () => {
    const { player } = get();
    if (!player) return;
    await player.togglePlay();
  },

  next: async () => {
    const { player } = get();
    if (!player) return;
    await player.nextTrack();
  },
}));

