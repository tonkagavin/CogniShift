from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
import numpy as np
import time

from app.models import SongProfile
from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/song-profiles", tags=["song-profiles"])
api_router = APIRouter(prefix="/api", tags=["song-profiles"])


class UpsertSongProfileRequest(BaseModel):
    userId: str
    profile: SongProfile


class SongProfileSnapshot(BaseModel):
    timestamp: float | int
    gamma: float | None = None
    beta: float | None = None
    alpha: float | None = None
    theta: float | None = None
    dominantState: str | None = None
    detectedState: str | None = None
    bands: dict[str, float] | None = None


class IngestSongProfileRequest(BaseModel):
    userId: str
    trackId: str
    trackName: str
    artist: str
    sessionSnapshots: list[SongProfileSnapshot]


def _extract_band(snapshot: SongProfileSnapshot, key: str) -> float:
    if snapshot.bands and key in snapshot.bands:
        return float(snapshot.bands[key])
    value = getattr(snapshot, key, None)
    return float(value) if value is not None else 0.0


def _state_of(snapshot: SongProfileSnapshot) -> str:
    return snapshot.detectedState or snapshot.dominantState or "relaxed"


@router.get("/{user_id}", response_model=list[SongProfile])
def list_song_profiles(user_id: str) -> list[SongProfile]:
    sb = get_supabase_client()
    res = sb.table("song_profiles").select("profile").eq("user_id", user_id).execute()
    rows = res.data or []
    out: list[SongProfile] = []
    for r in rows:
        try:
            out.append(SongProfile.model_validate(r["profile"]))
        except Exception:
            continue
    return out


@router.post("/{user_id}", response_model=SongProfile)
def upsert_song_profile(user_id: str, body: UpsertSongProfileRequest) -> SongProfile:
    sb = get_supabase_client()
    p = body.profile
    payload = {
        "user_id": user_id,
        "track_id": p.trackId,
        "profile": p.model_dump(),
        "listen_count": p.listenCount,
    }
    sb.table("song_profiles").upsert(payload, on_conflict="user_id,track_id").execute()
    return p


def _ingest_song_profile(body: IngestSongProfileRequest) -> dict:
    snapshots = body.sessionSnapshots
    if not snapshots:
        return {"status": "ignored", "reason": "empty_session"}

    started_ms = int(float(snapshots[0].timestamp) * 1000)
    ended_ms = int(float(snapshots[-1].timestamp) * 1000)
    duration_ms = max(0, ended_ms - started_ms)
    if duration_ms < 30_000:
        return {"status": "ignored", "reason": "session_too_short", "durationMs": duration_ms}

    bands = {}
    peaks = {}
    for key in ("gamma", "beta", "alpha", "theta"):
        values = [_extract_band(s, key) for s in snapshots]
        bands[key] = float(np.mean(values))
        peaks[key] = float(np.max(values))

    dominant_state = max(
        ((_state_of(s), 1) for s in snapshots),
        key=lambda kv: sum(1 for x in snapshots if _state_of(x) == kv[0]),
    )[0]
    engagement_score = float(bands["gamma"] / (bands["theta"] + 0.001))
    valence_score = float(bands["alpha"] / (bands["beta"] + 0.001))
    variance = float(
        np.var(
            np.array(
                [[_extract_band(s, k) for k in ("gamma", "beta", "alpha", "theta")] for s in snapshots],
                dtype=float,
            ),
            axis=0,
        ).mean()
    )
    stability_score = float(max(0.0, min(1.0, 1.0 - (variance / (variance + 1.0)))))

    sb = get_supabase_client()
    existing_res = (
        sb.table("song_profiles")
        .select("profile, listen_count")
        .eq("user_id", body.userId)
        .eq("track_id", body.trackId)
        .limit(1)
        .execute()
    )
    existing = (existing_res.data or [None])[0]
    prior_count = int(existing["listen_count"]) if existing else 0
    next_count = prior_count + 1

    prev_profile = (existing or {}).get("profile") or {}
    if prior_count > 0:
        prev_avg = (prev_profile.get("avgBandPower") or {}) if isinstance(prev_profile, dict) else {}
        for key in ("gamma", "beta", "alpha", "theta"):
            bands[key] = float((bands[key] + (float(prev_avg.get(key, 0.0)) * prior_count)) / next_count)

    profile = {
        "trackId": body.trackId,
        "trackName": body.trackName,
        "artist": body.artist,
        "listenCount": next_count,
        "avgBandPower": {
            "gamma": bands["gamma"],
            "beta": bands["beta"],
            "alpha": bands["alpha"],
            "theta": bands["theta"],
        },
        "peakBandPower": {
            "gamma": peaks["gamma"],
            "beta": peaks["beta"],
            "alpha": peaks["alpha"],
            "theta": peaks["theta"],
        },
        "dominantState": dominant_state,
        "engagementScore": engagement_score,
        "valenceScore": valence_score,
        "stabilityScore": stability_score,
        "lastUpdated": int(time.time() * 1000),
        "eegSessions": [],
    }

    sb.table("song_profiles").upsert(
        {
            "user_id": body.userId,
            "track_id": body.trackId,
            "profile": profile,
            "listen_count": next_count,
        },
        on_conflict="user_id,track_id",
    ).execute()

    sb.table("eeg_song_sessions").insert(
        {
            "user_id": body.userId,
            "track_id": body.trackId,
            "session_payload": {
                "durationMs": duration_ms,
                "snapshotCount": len(snapshots),
                "avgBandPower": bands,
                "peakBandPower": peaks,
                "dominantState": dominant_state,
                "engagementScore": engagement_score,
                "valenceScore": valence_score,
                "stabilityScore": stability_score,
            },
        }
    ).execute()

    return {"status": "ok", "listenCount": next_count, "profile": profile}


@api_router.post("/song-profiles")
def ingest_song_profile_api(body: IngestSongProfileRequest) -> dict:
    return _ingest_song_profile(body)


@router.post("/ingest")
def ingest_song_profile_legacy(body: IngestSongProfileRequest) -> dict:
    return _ingest_song_profile(body)

