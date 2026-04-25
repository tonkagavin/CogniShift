from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/simulations", tags=["simulations"])


class MockEegRunRequest(BaseModel):
    durationSec: int = 30
    pickleOut: str = "backend/data/eeg_synthetic_features.pkl"
    rawCsvOut: str = "backend/data/eeg_synthetic_raw.csv"


@router.post("/mock-eeg/run")
def run_mock_eeg_simulation(body: MockEegRunRequest) -> dict[str, str]:
    if body.durationSec < 2 or body.durationSec > 3600:
        raise HTTPException(status_code=400, detail="durationSec must be between 2 and 3600")

    root = Path(__file__).resolve().parents[3]
    script = root / "backend" / "scripts" / "generate_eeg_pickle.py"
    if not script.exists():
        raise HTTPException(status_code=500, detail="EEG generator script not found")

    pickle_out = root / body.pickleOut
    csv_out = root / body.rawCsvOut
    pickle_out.parent.mkdir(parents=True, exist_ok=True)
    csv_out.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        str(script),
        "--duration-sec",
        str(body.durationSec),
        "--pickle-out",
        str(pickle_out),
        "--raw-csv-out",
        str(csv_out),
    ]
    env = os.environ.copy()
    proc = subprocess.run(cmd, cwd=str(root), env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation failed: {proc.stderr.strip() or proc.stdout.strip()}",
        )

    return {
        "status": "ok",
        "picklePath": str(pickle_out),
        "csvPath": str(csv_out),
    }

