export type SpotifyTokenSet = {
  access_token: string;
  token_type: "Bearer";
  scope?: string;
  expires_in: number;
  refresh_token?: string;
  obtained_at_ms: number;
};

const KEY = "cognishift.spotify.token";

export function loadToken(): SpotifyTokenSet | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SpotifyTokenSet;
  } catch {
    return null;
  }
}

export function saveToken(token: SpotifyTokenSet): void {
  localStorage.setItem(KEY, JSON.stringify(token));
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}

export function isExpired(token: SpotifyTokenSet, skewMs = 30_000): boolean {
  const expiresAt = token.obtained_at_ms + token.expires_in * 1000;
  return Date.now() + skewMs >= expiresAt;
}

