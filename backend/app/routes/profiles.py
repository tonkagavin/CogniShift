from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models import UserProfile
from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/profiles", tags=["profiles"])


class UpsertUserProfileRequest(BaseModel):
    profile: UserProfile


@router.get("/{user_id}", response_model=UserProfile)
def get_profile(user_id: str) -> UserProfile:
    sb = get_supabase_client()
    res = sb.table("user_profiles").select("*").eq("id", user_id).maybe_single().execute()
    row = res.data
    if not row:
        return UserProfile(id=user_id, name=None, calibrationComplete=False)

    return UserProfile(
        id=row["id"],
        name=row.get("name"),
        calibrationComplete=row.get("calibration_complete", False),
        brainwaveBaselines=row.get("brainwave_baselines") or {},
    )


@router.post("/{user_id}", response_model=UserProfile)
def upsert_profile(user_id: str, body: UpsertUserProfileRequest) -> UserProfile:
    sb = get_supabase_client()
    p = body.profile
    payload = {
        "id": user_id,
        "name": p.name,
        "calibration_complete": p.calibrationComplete,
        "brainwave_baselines": p.brainwaveBaselines.model_dump(),
    }
    sb.table("user_profiles").upsert(payload, on_conflict="id").execute()
    return get_profile(user_id)

