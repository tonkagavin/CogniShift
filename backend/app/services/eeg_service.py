from __future__ import annotations

import os
from typing import Any

import numpy as np
from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams
from brainflow.data_filter import DataFilter, DetrendOperations, FilterTypes

DEFAULT_SAMPLE_WINDOW_SECONDS = 2


def _is_synthetic_enabled() -> bool:
    return os.getenv("EEG_USE_SYNTHETIC", "true").strip().lower() == "true"


def get_sample_window_seconds() -> int:
    value = os.getenv("EEG_SAMPLE_WINDOW_SECONDS", str(DEFAULT_SAMPLE_WINDOW_SECONDS)).strip()
    try:
        parsed = int(value)
    except ValueError:
        return DEFAULT_SAMPLE_WINDOW_SECONDS
    # Keep FFT windows large enough for meaningful output.
    return max(1, parsed)


def get_board_id() -> int:
    if _is_synthetic_enabled():
        return int(BoardIds.SYNTHETIC_BOARD)
    # Some BrainFlow builds may not expose this enum yet.
    neuropawn = getattr(BoardIds, "NEUROPAWN_KNIGHT_BOARD", None)
    if neuropawn is None:
        raise RuntimeError(
            "NEUROPAWN_KNIGHT_BOARD is unavailable in this BrainFlow build. "
            "Set EEG_USE_SYNTHETIC=true or update BrainFlow."
        )
    return int(neuropawn)


def create_board() -> BoardShim:
    BoardShim.enable_dev_board_logger()
    params = BrainFlowInputParams()
    board_id = get_board_id()
    if board_id != int(BoardIds.SYNTHETIC_BOARD):
        params.serial_port = os.getenv("EEG_SERIAL_PORT", "COM3")
    return BoardShim(board_id, params)


def _safe_band_power(channel: np.ndarray, sample_rate: int, low: float, high: float) -> float:
    try:
        return float(DataFilter.get_band_power(channel, sample_rate, low, high))
    except Exception:
        return 0.0


def get_band_powers(data: np.ndarray, board_id: int) -> dict[str, float]:
    sample_rate = BoardShim.get_sampling_rate(board_id)
    eeg_channels = BoardShim.get_eeg_channels(board_id)
    if not eeg_channels:
        return {"delta": 0.0, "theta": 0.0, "alpha": 0.0, "beta": 0.0, "gamma": 0.0}
    eeg_data = data[eeg_channels]

    band_powers: list[dict[str, float]] = []
    for channel in eeg_data:
        ch = np.array(channel, copy=True)
        if ch.size < max(sample_rate, 16):
            continue
        DataFilter.detrend(ch, DetrendOperations.CONSTANT.value)
        DataFilter.perform_bandpass(
            ch,
            sample_rate,
            1.0,
            50.0,
            4,
            FilterTypes.BUTTERWORTH_ZERO_PHASE.value,
            0,
        )
        band_powers.append(
            {
                "delta": _safe_band_power(ch, sample_rate, 0.5, 4.0),
                "theta": _safe_band_power(ch, sample_rate, 4.0, 8.0),
                "alpha": _safe_band_power(ch, sample_rate, 8.0, 13.0),
                "beta": _safe_band_power(ch, sample_rate, 13.0, 30.0),
                "gamma": _safe_band_power(ch, sample_rate, 30.0, 50.0),
            }
        )

    if not band_powers:
        return {"delta": 0.0, "theta": 0.0, "alpha": 0.0, "beta": 0.0, "gamma": 0.0}

    return {
        band: float(np.mean([ch[band] for ch in band_powers]))
        for band in ("delta", "theta", "alpha", "beta", "gamma")
    }


def classify_mental_state(bands: dict[str, float]) -> str:
    gamma = bands["gamma"]
    beta = bands["beta"]
    alpha = bands["alpha"]
    theta = bands["theta"]

    engagement = gamma / (theta + 0.001)
    relaxation = alpha / (beta + 0.001)
    drowsiness = theta / (beta + 0.001)
    valence = alpha / (beta + gamma + 0.001)

    if engagement > 2.5:
        return "focused"
    if relaxation > 1.8 and valence > 0.6:
        return "happy"
    if drowsiness > 2.0:
        return "sleepy"
    if relaxation > 1.4:
        return "relaxed"
    if engagement < 0.8 and relaxation < 1.0:
        return "sad"
    return "neutral"


def detect_gesture(channel_data: np.ndarray, sample_rate: int) -> str | None:
    if channel_data.size == 0 or sample_rate <= 0:
        return None
    peak = float(np.max(np.abs(channel_data)))
    duration_ms = (len(channel_data) / sample_rate) * 1000.0
    if peak > 150.0 and duration_ms >= 200:
        return "jawClench"
    if peak > 100.0 and duration_ms >= 500:
        return "longBlink"
    return None


def build_snapshot(data: np.ndarray, board_id: int) -> dict[str, Any]:
    bands = get_band_powers(data, board_id)
    state = classify_mental_state(bands)
    sample_rate = BoardShim.get_sampling_rate(board_id)
    eeg_channels = BoardShim.get_eeg_channels(board_id)
    frontal = data[eeg_channels[0]] if eeg_channels else np.array([])
    gesture = detect_gesture(frontal, sample_rate)

    signal_quality = 0
    if eeg_channels:
        eeg_matrix = data[eeg_channels]
        signal_quality = int(100 - (float(np.mean(np.abs(eeg_matrix) > 100)) * 100))
        signal_quality = max(0, min(100, signal_quality))

    dominant_band = max(bands, key=bands.get)
    return {
        "device": "neuropawn_knight" if board_id != int(BoardIds.SYNTHETIC_BOARD) else "synthetic_board",
        "signalQuality": signal_quality,
        "bands": bands,
        "dominantBand": dominant_band,
        "detectedState": state,
        "engagementScore": round(bands["gamma"] / (bands["theta"] + 0.001), 3),
        "valenceScore": round(bands["alpha"] / (bands["beta"] + 0.001), 3),
        "gesture": gesture,
        # Legacy fields used by existing frontend code paths.
        "gamma": bands["gamma"],
        "beta": bands["beta"],
        "alpha": bands["alpha"],
        "theta": bands["theta"],
        "delta": bands["delta"],
        "dominantState": state,
    }
