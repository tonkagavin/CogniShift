from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.profiles import router as profiles_router
from app.routes.song_profiles import router as song_profiles_router


def create_app() -> FastAPI:
    app = FastAPI(title="CogniShift API", version="0.1.0")

    allowed_origins = [
        os.environ.get("COGNISHIFT_FRONTEND_ORIGIN", "http://localhost:5173")
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(profiles_router)
    app.include_router(song_profiles_router)

    return app


app = create_app()

