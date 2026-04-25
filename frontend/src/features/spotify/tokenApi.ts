import type { SpotifyTokenSet } from "./tokenStorage";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  scope?: string;
  expires_in: number;
  refresh_token?: string;
};

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

async function postJson(path: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend spotify token request failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForToken(code: string, verifier: string): Promise<SpotifyTokenSet> {
  const token = await postJson("/spotify/token/exchange", {
    code,
    code_verifier: verifier,
  });

  return { ...token, obtained_at_ms: Date.now() };
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenSet> {
  const token = await postJson("/spotify/token/refresh", {
    refresh_token: refreshToken,
  });

  return {
    ...token,
    refresh_token: token.refresh_token ?? refreshToken,
    obtained_at_ms: Date.now(),
  };
}

