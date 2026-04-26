from __future__ import annotations

import asyncio
import json
import logging
import os
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from brainflow.board_shim import BoardShim
from starlette.websockets import WebSocketState

from app.services.eeg_service import (
    apply_config_board,
    apply_neuropawn_channel_routing,
    build_snapshot,
    create_board,
    get_board_id,
    get_sample_window_seconds,
    release_board_quietly,
    streaming_context,
    validate_bandpower_row_config,
)

router = APIRouter(tags=["eeg-live"])
logger = logging.getLogger("cognishift.eeg")


def _emit_debug(message: str, *, enabled: bool) -> None:
    if not enabled:
        return
    print(message, flush=True)


@router.get("/eeg/stream-config")
def eeg_stream_config() -> dict:
    """Resolved EEG serial/board settings (for debugging mismatches vs BrainFlow GUI)."""
    return streaming_context()


async def _open_board_with_retries(max_attempts: int = 6, delay_sec: float = 0.45):
    """Open serial session; retry after release (common when port was just held by BrainFlow GUI)."""
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        board = create_board()
        board_id = get_board_id()
        validate_bandpower_row_config(board_id)
        try:

            def _prepare_config_start(b: BoardShim) -> None:
                b.prepare_session()
                apply_config_board(b)
                b.start_stream()
                apply_neuropawn_channel_routing(b, board_id)

            await asyncio.to_thread(_prepare_config_start, board)
            return board, board_id
        except Exception as exc:
            last_exc = exc
            release_board_quietly(board)
            if attempt < max_attempts:
                await asyncio.sleep(delay_sec)
    assert last_exc is not None
    raise last_exc


@router.websocket("/ws/eeg")
async def eeg_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    sample_window_seconds = get_sample_window_seconds()
    log_snapshots = os.getenv("EEG_LOG_SNAPSHOTS", "false").strip().lower() == "true"
    board = None

    try:
        board, board_id = await _open_board_with_retries()
    except Exception as exc:
        # Do not crash the ASGI worker on hardware/driver/port issues.
        ctx = streaming_context()
        err = {
            "type": "eeg_error",
            "message": str(exc),
            "config": ctx,
            "hint": (
                "Close the BrainFlow EXG / board visualizer (it holds the COM port), then retry. "
                "Confirm EEG_SERIAL_PORT matches Device Manager. Try EEG_BOARD=knight_imu if your unit "
                "uses the IMU variant. Set EEG_SERIAL_TIMEOUT_MS=15000 if the device needs longer to wake."
            ),
        }
        _emit_debug(f"EEG_WS_OUT {json.dumps(err)}", enabled=log_snapshots)
        try:
            await websocket.send_text(json.dumps(err))
        except Exception:
            pass
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
        return

    try:
        min_interval = max(1, sample_window_seconds)
        min_gesture_gap = float(os.getenv("EEG_GESTURE_MIN_GAP_SEC", "1.8"))
        required_samples = max(64, int(BoardShim.get_sampling_rate(board_id) * sample_window_seconds))
        last_gesture_ts = 0.0
        ready_payload = {
            "type": "eeg_ready",
            "message": "Board session open; receiving band-power snapshots as buffers fill.",
            "config": streaming_context(),
            "sampleWindowSeconds": sample_window_seconds,
            "minIntervalSeconds": min_interval,
        }
        _emit_debug(f"EEG_WS_OUT {json.dumps(ready_payload)}", enabled=log_snapshots)
        await websocket.send_text(json.dumps(ready_payload))
        # At least 1s between successful snapshot emissions (FFT / buffer stability).
        while True:
            data = await asyncio.to_thread(board.get_current_board_data, required_samples)
            if data.size == 0 or data.shape[1] < required_samples:
                await asyncio.sleep(0.25)
                continue
            snapshot = build_snapshot(data, board_id)
            snapshot["timestamp"] = time.time()
            snapshot["bufferSamples"] = int(data.shape[1])
            snapshot["requiredSamples"] = int(required_samples)
            gesture = snapshot.get("gesture")
            if gesture:
                now_ts = float(snapshot["timestamp"])
                if now_ts - last_gesture_ts < min_gesture_gap:
                    snapshot["gesture"] = None
                else:
                    last_gesture_ts = now_ts
            payload = json.dumps(snapshot)
            if log_snapshots:
                _emit_debug(f"EEG_WS_OUT {payload}", enabled=True)
                logger.info("EEG_WS_OUT %s", payload)
            await websocket.send_text(payload)
            await asyncio.sleep(min_interval)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                err_payload = {
                    "type": "eeg_error",
                    "message": str(exc),
                    "config": streaming_context(),
                    "hint": "Stream interrupted.",
                }
                _emit_debug(f"EEG_WS_OUT {json.dumps(err_payload)}", enabled=log_snapshots)
                await websocket.send_text(json.dumps(err_payload))
            except Exception:
                pass
    finally:
        release_board_quietly(board)
