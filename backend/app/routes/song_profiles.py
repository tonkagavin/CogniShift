from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models import SongProfile
from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/song-profiles", tags=["song-profiles"])


class UpsertSongProfileRequest(BaseModel):
    userId: str
    profile: SongProfile


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

