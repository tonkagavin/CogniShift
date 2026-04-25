from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

MentalState = Literal["focus", "flow", "relax", "sleep"]


class BandPowerProfile(BaseModel):
    gamma: float = 0.0
    beta: float = 0.0
    alpha: float = 0.0
    theta: float = 0.0


class BrainwaveSnapshot(BaseModel):
    timestamp: int
    gamma: float
    beta: float
    alpha: float
    theta: float
    dominantState: MentalState


class EEGSongSession(BaseModel):
    date: int
    snapshots: list[BrainwaveSnapshot]
    dominantState: MentalState


class SongProfile(BaseModel):
    trackId: str
    trackName: str
    artist: str
    listenCount: int = 0
    avgBandPower: BandPowerProfile = Field(default_factory=BandPowerProfile)
    peakBandPower: BandPowerProfile = Field(default_factory=BandPowerProfile)
    dominantState: MentalState = "flow"
    engagementScore: float = 0.0
    valenceScore: float = 0.0
    stabilityScore: float = 0.0
    lastUpdated: int
    eegSessions: list[EEGSongSession] = Field(default_factory=list)


class UserProfile(BaseModel):
    id: str
    name: Optional[str] = None
    calibrationComplete: bool = False
    brainwaveBaselines: BandPowerProfile = Field(default_factory=BandPowerProfile)
    # For v1, we keep musicMoodMap/listeningHistory minimal in API; expand as needed.

