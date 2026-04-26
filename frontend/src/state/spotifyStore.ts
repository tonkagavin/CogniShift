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
  isPremiumReady: boolean | null;
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

async function transferPlaybackToDevice(
  accessToken: string,
  deviceId: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const transferRes = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play: false,
    }),
  });
  const detail = transferRes.ok ? "" : await transferRes.text().catch(() => "");
  return { ok: transferRes.ok, status: transferRes.status, detail };
}

export const useSpotifyStore = create<SpotifyStore>((set, get) => ({
  token: loadToken(),
  isAuthed: !!loadToken(),

  player: null,
  deviceId: null,
  isConnected: false,
  isReady: false,
  isPremiumReady: null,
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
      const token = await exchangeCodeForToken(
        hit.code,
        verifier,
        `${window.location.origin}/dashboard`,
      );
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
      isPremiumReady: null,
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

    const onReady = async (payload: { device_id: string }) => {
      set({ deviceId: payload.device_id, isReady: true, lastError: null });
      try {
        const accessToken = await get().ensureValidToken();
        const firstAttempt = await transferPlaybackToDevice(accessToken, payload.device_id);
        if (!firstAttempt.ok) {
          // Spotify can briefly return 404 "Device not found" immediately after ready.
          if (firstAttempt.status === 404) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            const secondAttempt = await transferPlaybackToDevice(accessToken, payload.device_id);
            if (secondAttempt.ok) {
              set({
                lastError:
                  "Player connected. Device transfer recovered after startup delay. Press Play / Pause to continue.",
              });
              return;
            }
            set({
              lastError:
                "Player connected, but Spotify has not registered this browser device yet. Open Spotify on any device, start a track once, then press Connect Player again.",
            });
            return;
          }
          set({
            lastError: `Player ready, but failed to transfer playback (${firstAttempt.status})${firstAttempt.detail ? `: ${firstAttempt.detail}` : ""}`,
          });
          return;
        }
        set({ lastError: "Player ready. Press Play / Pause to control playback in browser." });
      } catch (e) {
        set({ lastError: e instanceof Error ? e.message : String(e) });
      }
    };
    const onNotReady = (payload: { device_id: string }) => {
      console.error("Device went offline:", payload.device_id);
      set({ isReady: false, isConnected: false });
    };
    const onState = (s: SpotifyPlaybackState) => {
      set({ currentTrack: stateToTrack(s), isPaused: s.paused });
    };
    const onInitError = (e: { message: string }) => {
      console.error("Init error:", e.message);
      set({ lastError: e.message });
    };
    const onAuthError = (e: { message: string }) => {
      console.error("Auth error:", e.message);
      set({ lastError: e.message, isAuthed: false });
    };
    const onAccountError = (e: { message: string }) => {
      console.error("Account error:", e.message);
      set({
        lastError: `${e.message}. CogniShift requires a Spotify Premium account for playback`,
        isPremiumReady: false,
      });
    };
    const onPlaybackError = (e: { message: string }) => {
      console.error("Playback error:", e.message);
      set({ lastError: e.message });
    };

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
    // Do not treat null state as non-premium: SDK may return null until an active playback context exists.
    set({
      isPremiumReady: null,
      lastError: "Connected. If playback is paused elsewhere, transfer and press Play / Pause once.",
    });
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

