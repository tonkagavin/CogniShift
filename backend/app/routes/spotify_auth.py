from __future__ import annotations

import os
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/spotify", tags=["spotify-auth"])

SPOTIFY_AUTH_BASE = "https://accounts.spotify.com"
SPOTIFY_SCOPES = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
]


def _spotify_env() -> tuple[str, str, str]:
    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("SPOTIFY_REDIRECT_URI", "")
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(
            status_code=500,
            detail="Missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET/SPOTIFY_REDIRECT_URI",
        )
    return client_id, client_secret, redirect_uri


class AuthorizeUrlResponse(BaseModel):
    authorizeUrl: str


@router.get("/authorize-url", response_model=AuthorizeUrlResponse)
def get_authorize_url(
    code_challenge: str, state: str, redirect_uri: str | None = None
) -> AuthorizeUrlResponse:
    client_id, _, default_redirect_uri = _spotify_env()
    chosen_redirect_uri = (redirect_uri or default_redirect_uri).strip()
    params = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": chosen_redirect_uri,
            "code_challenge_method": "S256",
            "code_challenge": code_challenge,
            "state": state,
            "scope": " ".join(SPOTIFY_SCOPES),
        }
    )
    return AuthorizeUrlResponse(authorizeUrl=f"{SPOTIFY_AUTH_BASE}/authorize?{params}")


class ExchangeTokenRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


@router.post("/token/exchange")
async def exchange_token(body: ExchangeTokenRequest) -> dict:
    client_id, client_secret, default_redirect_uri = _spotify_env()
    redirect_uri = (body.redirect_uri or default_redirect_uri).strip()
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            f"{SPOTIFY_AUTH_BASE}/api/token",
            data={
                "grant_type": "authorization_code",
                "code": body.code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "client_secret": client_secret,
                "code_verifier": body.code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if res.status_code >= 400:
        raise HTTPException(status_code=res.status_code, detail="Spotify token exchange failed")
    return res.json()


@router.post("/token/refresh")
async def refresh_token(body: RefreshTokenRequest) -> dict:
    client_id, client_secret, _ = _spotify_env()
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            f"{SPOTIFY_AUTH_BASE}/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": body.refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=res.status_code, detail="Spotify token refresh failed")
    return res.json()

