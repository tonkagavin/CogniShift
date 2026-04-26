from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes.eeg_stream import api_router as eeg_thresholds_router
from app.routes.eeg_stream import router as eeg_stream_router
from app.routes.eeg_ws import router as eeg_ws_router
from app.routes.profiles import router as profiles_router
from app.routes.queue_predict import router as queue_predict_router
from app.routes.song_profiles import api_router as song_profiles_api_router
from app.routes.song_profiles import router as song_profiles_router
from app.routes.simulations import router as simulations_router
from app.routes.spotify_auth import router as spotify_auth_router
from app.services.eeg_service import streaming_context as eeg_streaming_context


def create_app() -> FastAPI:
    load_dotenv(override=True)
    app = FastAPI(title="CogniShift API", version="0.1.0")

    # Allow both localhost and 127.0.0.1 in dev to avoid CORS "Failed to fetch"
    # when browser origin and API host spellings differ.
    configured_origin = os.environ.get("COGNISHIFT_FRONTEND_ORIGIN")
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    if configured_origin and configured_origin not in allowed_origins:
        allowed_origins.append(configured_origin)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "eeg": eeg_streaming_context()}

    app.include_router(profiles_router)
    app.include_router(song_profiles_router)
    app.include_router(song_profiles_api_router)
    app.include_router(eeg_stream_router)
    app.include_router(eeg_thresholds_router)
    app.include_router(eeg_ws_router)
    app.include_router(spotify_auth_router)
    app.include_router(simulations_router)
    app.include_router(queue_predict_router)

    return app


app = create_app()

