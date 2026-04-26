from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models import (
    EegArtifactsIngestRequest,
    EegSnapshotIngestRequest,
    EegStreamSessionCloseRequest,
    EegStreamSessionCreateRequest,
)
from app.services.supabase_client import get_supabase_client

router = APIRouter(prefix="/eeg-stream", tags=["eeg-stream"])


@router.post("/sessions")
def start_stream_session(body: EegStreamSessionCreateRequest) -> dict:
    sb = get_supabase_client()
    payload = {
        "user_id": body.userId,
        "source": body.source,
        "sample_rate_hz": body.sampleRateHz,
        "meta": body.meta,
    }
    res = sb.table("eeg_stream_sessions").insert(payload).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to create eeg stream session")
    return {"sessionId": rows[0]["id"]}


@router.post("/sessions/{session_id}/close")
def close_stream_session(session_id: str, body: EegStreamSessionCloseRequest) -> dict:
    sb = get_supabase_client()
    ended_at = body.endedAtIso or datetime.now(timezone.utc).isoformat()
    sb.table("eeg_stream_sessions").update({"ended_at": ended_at}).eq("id", session_id).execute()
    return {"status": "ok", "sessionId": session_id}


@router.post("/sessions/{session_id}/snapshots")
def ingest_snapshots(session_id: str, body: EegSnapshotIngestRequest) -> dict:
    if not body.snapshots:
        return {"status": "ok", "inserted": 0}
    sb = get_supabase_client()
    rows = []
    for s in body.snapshots:
        rows.append(
            {
                "session_id": session_id,
                "ts_ms": int(s.get("timestamp", 0)),
                "theta": float(s.get("theta", 0)),
                "alpha": float(s.get("alpha", 0)),
                "beta": float(s.get("beta", 0)),
                "gamma": float(s.get("gamma", 0)),
                "dominant_state": s.get("dominantState", "flowState"),
                "payload": s,
            }
        )
    sb.table("eeg_stream_snapshots").insert(rows).execute()
    return {"status": "ok", "inserted": len(rows)}


@router.post("/sessions/{session_id}/artifacts")
def ingest_artifacts(session_id: str, body: EegArtifactsIngestRequest) -> dict:
    if not body.events:
        return {"status": "ok", "inserted": 0}
    sb = get_supabase_client()
    rows = []
    for e in body.events:
        rows.append(
            {
                "session_id": session_id,
                "ts_ms": e.tsMs,
                "artifact_type": e.artifactType,
                "confidence": e.confidence,
                "duration_ms": e.durationMs,
                "channel": e.channel,
                "peak_amplitude": e.peakAmplitude,
                "payload": e.model_dump(),
            }
        )
    sb.table("eeg_artifact_events").insert(rows).execute()
    return {"status": "ok", "inserted": len(rows)}


@router.get("/sessions/{session_id}/snapshots")
def list_session_snapshots(session_id: str) -> dict:
    sb = get_supabase_client()
    res = (
        sb.table("eeg_stream_snapshots")
        .select("*")
        .eq("session_id", session_id)
        .order("ts_ms", desc=False)
        .execute()
    )
    return {"rows": res.data or []}

