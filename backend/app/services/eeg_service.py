from __future__ import annotations

import os
import re
import time
from typing import Any

import numpy as np
from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams
from brainflow.data_filter import DataFilter, DetrendOperations, FilterTypes

DEFAULT_SAMPLE_WINDOW_SECONDS = 2
NEUROPAWN_BOARD_IDS = {
    int(getattr(BoardIds, "NEUROPAWN_KNIGHT_BOARD", 57)),
    int(getattr(BoardIds, "NEUROPAWN_KNIGHT_BOARD_IMU", 66)),
}


def normalize_serial_port(raw: str | None) -> str:
    """Normalize COM port string for BrainFlow on Windows."""
    if not raw:
        return "COM3"
    p = raw.strip().strip('"').strip("'")
    if not p:
        return "COM3"
    # Already extended Windows device path
    if ".\\" in p or "/" in p:
        return p
    m = re.fullmatch(r"(?i)com(\d+)", p)
    if m:
        n = int(m.group(1))
        # COM10+ typically requires \\.\COM10 on Windows.
        if n >= 10:
            return rf"\\.\COM{n}"
        return f"COM{n}"
    return p


def _is_synthetic_enabled() -> bool:
    return os.getenv("EEG_USE_SYNTHETIC", "true").strip().lower() == "true"


def get_sample_window_seconds() -> float:
    value = os.getenv("EEG_SAMPLE_WINDOW_SECONDS", str(DEFAULT_SAMPLE_WINDOW_SECONDS)).strip()
    try:
        parsed = float(value)
    except ValueError:
        return float(DEFAULT_SAMPLE_WINDOW_SECONDS)
    # Keep FFT windows large enough for meaningful output.
    return max(1.0, parsed)


def get_board_id() -> int:
    if _is_synthetic_enabled():
        return int(BoardIds.SYNTHETIC_BOARD)
    mode = os.getenv("EEG_BOARD", "knight").strip().lower()
    if mode in ("knight", "neuropawn", "neuropawn_knight", "57"):
        bid = getattr(BoardIds, "NEUROPAWN_KNIGHT_BOARD", None)
    elif mode in ("knight_imu", "neuropawn_imu", "imu", "66"):
        bid = getattr(BoardIds, "NEUROPAWN_KNIGHT_BOARD_IMU", None)
    else:
        try:
            bid = int(mode)
        except ValueError:
            bid = getattr(BoardIds, "NEUROPAWN_KNIGHT_BOARD", None)
    if bid is None:
        raise RuntimeError(
            "Neuropawn board id unavailable in this BrainFlow build. "
            "Set EEG_USE_SYNTHETIC=true, update BrainFlow, or set EEG_BOARD to a supported value "
            "(knight, knight_imu)."
        )
    return int(bid)


def create_board() -> BoardShim:
    BoardShim.enable_dev_board_logger()
    params = BrainFlowInputParams()
    board_id = get_board_id()
    if board_id != int(BoardIds.SYNTHETIC_BOARD):
        params.serial_port = normalize_serial_port(os.getenv("EEG_SERIAL_PORT", "COM3"))
        timeout_ms = os.getenv("EEG_SERIAL_TIMEOUT_MS", "").strip()
        if timeout_ms.isdigit():
            params.timeout = int(timeout_ms)
        gain = os.getenv("EEG_KNIGHT_GAIN", "").strip()
        if gain.isdigit() and not os.getenv("EEG_OTHER_INFO", "").strip():
            params.other_info = f'{{"gain": {int(gain)}}}'
        # Optional board params (see BrainFlow Supported Boards → NeuroPawn Knight), e.g. '{"gain":6}'
        other = os.getenv("EEG_OTHER_INFO", "").strip()
        if other:
            params.other_info = other
    return BoardShim(board_id, params)


def release_board_quietly(board: BoardShim | None) -> None:
    if board is None:
        return
    try:
        board.stop_stream()
    except Exception:
        pass
    try:
        board.release_session()
    except Exception:
        pass


def streaming_context() -> dict[str, Any]:
    """Resolved EEG settings for diagnostics (REST / error payloads)."""
    use_syn = _is_synthetic_enabled()
    board_id = int(BoardIds.SYNTHETIC_BOARD) if use_syn else get_board_id()
    port = normalize_serial_port(os.getenv("EEG_SERIAL_PORT", "COM3")) if not use_syn else ""
    eeg_rows = BoardShim.get_eeg_channels(board_id) if not use_syn else []
    exg_rows = BoardShim.get_exg_channels(board_id) if not use_syn else []
    band_rows: list[int] | None = None
    bandpower_error: str | None = None
    if not use_syn:
        try:
            band_rows = _bandpower_eeg_rows(board_id)
        except ValueError as ve:
            bandpower_error = str(ve)
    return {
        "synthetic": use_syn,
        "boardId": board_id,
        "serialPort": port,
        "boardEnv": os.getenv("EEG_BOARD", "knight"),
        "eegChannelRows": list(eeg_rows),
        "exgChannelRows": list(exg_rows),
        "bandpowerRows": band_rows,
        "bandpowerConfigError": bandpower_error,
        "otherInfoSet": bool(os.getenv("EEG_OTHER_INFO", "").strip()),
        "configBoardSet": bool(os.getenv("EEG_CONFIG_BOARD", "").strip()),
    }


def _parse_int_list(env_name: str) -> list[int] | None:
    raw = os.getenv(env_name, "").strip()
    if not raw:
        return None
    out: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out or None


def _bandpower_eeg_rows(board_id: int) -> list[int]:
    """Rows (in get_board_data()) used for band-power; prefer EXG channels for Neuropawn."""
    exg = list(BoardShim.get_exg_channels(board_id))
    eeg = list(BoardShim.get_eeg_channels(board_id))
    allowed = set(exg or eeg)
    if not allowed:
        return []
    override = _parse_int_list("EEG_BANDPOWER_ROWS")
    if not override:
        return sorted(allowed)
    bad = [r for r in override if r not in allowed]
    if bad:
        raise ValueError(
            f"EEG_BANDPOWER_ROWS contains non-EEG rows {bad} for board_id={board_id}. "
            f"Allowed EXG/EEG rows: {sorted(allowed)}"
        )
    return override


def validate_bandpower_row_config(board_id: int) -> None:
    """Raises ValueError if EEG_BANDPOWER_ROWS is invalid for this board."""
    _bandpower_eeg_rows(board_id)


def apply_config_board(board: BoardShim) -> str | None:
    """Optional vendor-specific config string (BrainFlow BoardShim.config_board)."""
    cmd = os.getenv("EEG_CONFIG_BOARD", "").strip()
    if not cmd:
        return None
    return board.config_board(cmd)


def apply_neuropawn_channel_routing(board: BoardShim, board_id: int) -> None:
    """Apply Neuropawn vendor template channel + RLD routing commands."""
    if board_id not in NEUROPAWN_BOARD_IDS:
        return
    num_channels_env = os.getenv("EEG_KNIGHT_CHANNEL_COUNT", "").strip()
    exg_rows = BoardShim.get_exg_channels(board_id)
    default_channels = len(exg_rows) if exg_rows else 8
    num_channels = int(num_channels_env) if num_channels_env.isdigit() else default_channels
    num_channels = max(1, min(8, num_channels))

    gain = os.getenv("EEG_KNIGHT_GAIN", "12").strip()
    gain_val = int(gain) if gain.isdigit() else 12
    step_delay = float(os.getenv("EEG_KNIGHT_CONFIG_STEP_DELAY_SEC", "0.15"))

    for x in range(1, num_channels + 1):
        board.config_board(f"chon_{x}_{gain_val}")
        time.sleep(step_delay)
        board.config_board(f"rldadd_{x}")
        time.sleep(step_delay)


def _safe_band_power(channel: np.ndarray, sample_rate: int, low: float, high: float) -> float:
    try:
        return float(DataFilter.get_band_power(channel, sample_rate, low, high))
    except Exception:
        return 0.0


def get_band_powers(data: np.ndarray, board_id: int) -> dict[str, float]:
    sample_rate = BoardShim.get_sampling_rate(board_id)
    eeg_rows = _bandpower_eeg_rows(board_id)
    if not eeg_rows:
        return {"theta": 0.0, "alpha": 0.0, "beta": 0.0, "gamma": 0.0}
    # Require enough samples for stable PSD/bandpower estimation.
    if data.shape[1] < max(64, sample_rate):
        return {"theta": 0.0, "alpha": 0.0, "beta": 0.0, "gamma": 0.0}

    # Prefer BrainFlow's averaged bandpower helper.
    try:
        avg, _std = DataFilter.get_avg_band_powers(data, eeg_rows, sample_rate, True)
        return {
            "theta": float(avg[1]),
            "alpha": float(avg[2]),
            "beta": float(avg[3]),
            "gamma": float(avg[4]),
        }
    except Exception:
        pass

    eeg_data = data[eeg_rows]

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
                "theta": _safe_band_power(ch, sample_rate, 4.0, 8.0),
                "alpha": _safe_band_power(ch, sample_rate, 8.0, 13.0),
                "beta": _safe_band_power(ch, sample_rate, 13.0, 30.0),
                "gamma": _safe_band_power(ch, sample_rate, 30.0, 50.0),
            }
        )

    if not band_powers:
        return {"theta": 0.0, "alpha": 0.0, "beta": 0.0, "gamma": 0.0}

    return {
        band: float(np.mean([ch[band] for ch in band_powers]))
        for band in ("theta", "alpha", "beta", "gamma")
    }


def classify_mental_state(bands: dict[str, float]) -> str:
    # Four-category mapping requested:
    # theta->sleepy, alpha->relaxed, beta->focused, gamma->flowState
    band_scores = {
        "sleepy": float(bands["theta"]),
        "relaxed": float(bands["alpha"]),
        "focused": float(bands["beta"]),
        "flowState": float(bands["gamma"]),
    }
    return max(band_scores, key=band_scores.get)


def detect_gesture(channel_data: np.ndarray, sample_rate: int) -> str | None:
    if channel_data.size == 0 or sample_rate <= 0:
        return None
    base = np.array(channel_data, copy=True)
    DataFilter.detrend(base, DetrendOperations.CONSTANT.value)

    jaw = np.array(base, copy=True)
    # Jaw clench: short, high-amplitude muscle artifact (higher-frequency energy).
    DataFilter.perform_bandpass(
        jaw,
        sample_rate,
        20.0,
        95.0,
        2,
        FilterTypes.BUTTERWORTH_ZERO_PHASE.value,
        0,
    )
    jaw_abs = np.abs(jaw)
    jaw_peak = float(np.max(jaw_abs))
    jaw_rms = float(np.sqrt(np.mean(jaw**2)) + 1e-6)

    blink = np.array(base, copy=True)
    # Long blink: slower frontal deflection (lower-frequency envelope).
    DataFilter.perform_bandpass(
        blink,
        sample_rate,
        0.5,
        12.0,
        2,
        FilterTypes.BUTTERWORTH_ZERO_PHASE.value,
        0,
    )
    blink_abs = np.abs(blink)
    blink_peak = float(np.max(blink_abs))
    blink_rms = float(np.sqrt(np.mean(blink**2)) + 1e-6)

    def max_run_ms(abs_signal: np.ndarray, threshold: float) -> float:
        mask = abs_signal > threshold
        best = 0
        cur = 0
        for v in mask:
            if v:
                cur += 1
                best = max(best, cur)
            else:
                cur = 0
        return (best / sample_rate) * 1000.0

    # New vars, with backward compatibility fallbacks.
    jaw_thr = float(os.getenv("EEG_JAW_SPIKE_THRESHOLD_UV", os.getenv("EEG_GESTURE_JAW_THRESHOLD", "220")))
    jaw_min_ms = float(os.getenv("EEG_JAW_SPIKE_MIN_MS", "40"))
    jaw_max_ms = float(os.getenv("EEG_JAW_SPIKE_MAX_MS", "260"))
    jaw_rms_mult = float(os.getenv("EEG_JAW_SPIKE_RMS_MULT", "4.0"))

    blink_thr = float(os.getenv("EEG_BLINK_THRESHOLD_UV", os.getenv("EEG_GESTURE_BLINK_THRESHOLD", "90")))
    blink_min_ms = float(os.getenv("EEG_BLINK_MIN_MS", "300"))
    blink_rms_mult = float(os.getenv("EEG_BLINK_RMS_MULT", "2.5"))

    jaw_run = max_run_ms(jaw_abs, jaw_thr)
    blink_run = max_run_ms(blink_abs, blink_thr)

    # Jaw clench = spike-like (amplitude + compact duration in high-frequency band).
    if jaw_peak > jaw_thr and jaw_min_ms <= jaw_run <= jaw_max_ms and jaw_peak > jaw_rms_mult * jaw_rms:
        return "jawClench"
    # Blink = slower event (longer duration, lower band).
    if blink_peak > blink_thr and blink_run >= blink_min_ms and blink_peak > blink_rms_mult * blink_rms:
        return "longBlink"
    return None


def build_snapshot(data: np.ndarray, board_id: int) -> dict[str, Any]:
    bands = get_band_powers(data, board_id)
    state = classify_mental_state(bands)
    sample_rate = BoardShim.get_sampling_rate(board_id)
    eeg_rows = _bandpower_eeg_rows(board_id)
    frontal = data[eeg_rows[0]] if eeg_rows else np.array([])
    gesture = detect_gesture(frontal, sample_rate)

    signal_quality = 0
    if eeg_rows:
        eeg_matrix = data[eeg_rows]
        signal_quality = int(100 - (float(np.mean(np.abs(eeg_matrix) > 100)) * 100))
        signal_quality = max(0, min(100, signal_quality))

    dominant_band = max(bands, key=bands.get)
    return {
        "device": "neuropawn_knight" if board_id != int(BoardIds.SYNTHETIC_BOARD) else "synthetic_board",
        "eegRowsUsed": eeg_rows,
        "eegChannelRows": list(BoardShim.get_eeg_channels(board_id)),
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
        "dominantState": state,
    }
