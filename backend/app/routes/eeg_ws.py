from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.eeg_service import (
    build_snapshot,
    create_board,
    get_board_id,
    get_sample_window_seconds,
)

router = APIRouter(tags=["eeg-live"])


@router.websocket("/ws/eeg")
async def eeg_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    board = create_board()
    board_id = get_board_id()
    sample_window_seconds = get_sample_window_seconds()

    board.prepare_session()
    board.start_stream()
    try:
        while True:
            await asyncio.sleep(sample_window_seconds)
            data = board.get_board_data()
            if data.size == 0 or data.shape[1] == 0:
                continue
            snapshot = build_snapshot(data, board_id)
            snapshot["timestamp"] = time.time()
            await websocket.send_text(json.dumps(snapshot))
    except WebSocketDisconnect:
        pass
    finally:
        try:
            board.stop_stream()
        except Exception:
            pass
        try:
            board.release_session()
        except Exception:
            pass
