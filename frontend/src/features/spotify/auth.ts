import { pkceChallengeFromVerifier, randomString } from "./pkce";

const VERIFIER_KEY = "cognishift.spotify.pkce.verifier";
const STATE_KEY = "cognishift.spotify.pkce.state";
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

export async function beginSpotifyLogin(): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = await pkceChallengeFromVerifier(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const res = await fetch(
    `${backendUrl}/spotify/authorize-url?code_challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`,
  );
  if (!res.ok) {
    throw new Error("Failed to build Spotify authorize URL from backend");
  }
  const payload = (await res.json()) as { authorizeUrl: string };
  window.location.assign(payload.authorizeUrl);
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

