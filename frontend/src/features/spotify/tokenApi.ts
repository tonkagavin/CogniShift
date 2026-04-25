import { SPOTIFY_AUTH_BASE } from "./constants";
import { getSpotifyClientId, getSpotifyRedirectUri } from "./auth";
import type { SpotifyTokenSet } from "./tokenStorage";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  scope?: string;
  expires_in: number;
  refresh_token?: string;
};

async function postForm(path: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${SPOTIFY_AUTH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token request failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForToken(code: string, verifier: string): Promise<SpotifyTokenSet> {
  const clientId = getSpotifyClientId();
  const redirectUri = getSpotifyRedirectUri();

  const token = await postForm("/api/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  return { ...token, obtained_at_ms: Date.now() };
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenSet> {
  const clientId = getSpotifyClientId();

  const token = await postForm("/api/token", {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  });

  return {
    ...token,
    refresh_token: token.refresh_token ?? refreshToken,
    obtained_at_ms: Date.now(),
  };
}

