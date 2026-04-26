from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter

from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/api/queue", tags=["queue"])

TARGET_VECTORS: dict[str, dict[str, float]] = {
    "focused": {"gamma": 1.0, "beta": 0.8, "alpha": 0.3, "theta": 0.1, "delta": 0.1},
    "happy": {"gamma": 0.5, "beta": 0.7, "alpha": 0.6, "theta": 0.2, "delta": 0.1},
    "relaxed": {"gamma": 0.2, "beta": 0.3, "alpha": 1.0, "theta": 0.4, "delta": 0.2},
    "sleepy": {"gamma": 0.1, "beta": 0.1, "alpha": 0.4, "theta": 1.0, "delta": 0.8},
    "sad": {"gamma": 0.1, "beta": 0.2, "alpha": 0.7, "theta": 0.5, "delta": 0.3},
}


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na <= 1e-9 or nb <= 1e-9:
        return 0.0
    return dot / (na * nb)


@router.get("/predict")
async def predict_queue(userId: str, targetState: str, currentTrackId: str = "", currentArtist: str = "") -> dict:
    sb = get_supabase_client()
    target = TARGET_VECTORS.get(targetState, TARGET_VECTORS["focused"])
    tvec = [target["gamma"], target["beta"], target["alpha"], target["theta"], target["delta"]]
    res = (
        sb.table("song_profiles")
        .select("track_id, profile, listen_count")
        .eq("user_id", userId)
        .execute()
    )
    rows = res.data or []
    scored: list[dict[str, Any]] = []
    for row in rows:
        p = row.get("profile") or {}
        avg = p.get("avgBandPower") or {}
        pvec = [
            float(avg.get("gamma", 0)),
            float(avg.get("beta", 0)),
            float(avg.get("alpha", 0)),
            float(avg.get("theta", 0)),
            0.1,
        ]
        score = (_cosine(tvec, pvec) + 1.0) / 2.0
        if row.get("track_id") == currentTrackId:
            score -= 0.2
        if int(row.get("listen_count") or 0) < 2:
            score -= 0.15
        dominant = max(("gamma", "beta", "alpha", "theta"), key=lambda k: float(avg.get(k, 0)))
        scored.append(
            {
                "trackId": row.get("track_id"),
                "trackName": p.get("trackName", row.get("track_id")),
                "artist": p.get("artist", ""),
                "matchScore": max(0.0, min(1.0, score)),
                "matchBand": dominant.capitalize(),
                "source": "profile",
                "isDiscovery": False,
            }
        )

    scored.sort(key=lambda x: x["matchScore"], reverse=True)
    qualified = [x for x in scored if x["matchScore"] >= 0.5]

    if len(qualified) < 5 and currentArtist and currentTrackId and os.getenv("LASTFM_API_KEY"):
        api_key = os.environ["LASTFM_API_KEY"]
        params = {
            "method": "track.getSimilar",
            "artist": currentArtist,
            "track": currentTrackId,
            "api_key": api_key,
            "limit": 10,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://ws.audioscrobbler.com/2.0/", params=params)
            payload = response.json() if response.status_code < 400 else {}
        tracks = ((payload.get("similartracks") or {}).get("track") or []) if isinstance(payload, dict) else []
        known = {x["trackId"] for x in scored}
        for tr in tracks:
            tid = f'{tr.get("artist", {}).get("name", "")}:{tr.get("name", "")}'
            if tid in known:
                continue
            scored.append(
                {
                    "trackId": tid,
                    "trackName": tr.get("name", "Unknown"),
                    "artist": tr.get("artist", {}).get("name", ""),
                    "matchScore": 0.5,
                    "matchBand": "Alpha",
                    "source": "lastfm",
                    "isDiscovery": True,
                }
            )

    scored.sort(key=lambda x: x["matchScore"], reverse=True)
    return {"queue": scored[:5]}
