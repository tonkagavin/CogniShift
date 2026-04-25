import { SPOTIFY_AUTH_BASE, SPOTIFY_SCOPES } from "./constants";
import { pkceChallengeFromVerifier, randomString } from "./pkce";

const VERIFIER_KEY = "cognishift.spotify.pkce.verifier";
const STATE_KEY = "cognishift.spotify.pkce.state";

export function getSpotifyClientId(): string {
  const v = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!v) throw new Error("Missing VITE_SPOTIFY_CLIENT_ID");
  return v;
}

export function getSpotifyRedirectUri(): string {
  const v = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
  if (!v) throw new Error("Missing VITE_SPOTIFY_REDIRECT_URI");
  return v;
}

export async function beginSpotifyLogin(): Promise<void> {
  const clientId = getSpotifyClientId();
  const redirectUri = getSpotifyRedirectUri();

  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = await pkceChallengeFromVerifier(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: SPOTIFY_SCOPES.join(" "),
  });

  window.location.assign(`${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`);
}

export function readAuthCodeFromUrl(): { code: string; state: string } | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return null;
  return { code, state };
}

export function clearAuthCodeFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
  window.history.replaceState({}, "", url.toString());
}

export function takePkceVerifierOrThrow(stateFromUrl: string): string {
  const expectedState = sessionStorage.getItem(STATE_KEY);
  if (!expectedState || expectedState !== stateFromUrl) {
    throw new Error("Spotify state mismatch");
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier");
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return verifier;
}

