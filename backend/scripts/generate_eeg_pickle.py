from __future__ import annotations

import argparse
import pickle
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

try:
    from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams
    from brainflow.data_filter import DataFilter

    BRAINFLOW_AVAILABLE = True
except Exception:
    BRAINFLOW_AVAILABLE = False


@dataclass
class Snapshot:
    timestamp: int
    delta: float
    theta: float
    alpha: float
    beta: float
    gamma: float
    dominantState: str


def dominant_state(snapshot: Snapshot) -> str:
    focus = snapshot.gamma + snapshot.beta
    flow = (snapshot.alpha + snapshot.beta) / 2
    relax = snapshot.alpha
    sleep = snapshot.theta
    ranking = sorted(
        [("focus", focus), ("flow", flow), ("relax", relax), ("sleep", sleep)],
        key=lambda x: x[1],
        reverse=True,
    )
    return ranking[0][0]


def aggregate_band_power_2s(board: BoardShim, sampling_rate: int) -> Snapshot:
    data = board.get_current_board_data(sampling_rate * 2)
    eeg_channels = BoardShim.get_eeg_channels(board.board_id)
    ts_channel = BoardShim.get_timestamp_channel(board.board_id)

    delta_vals: list[float] = []
    theta_vals: list[float] = []
    alpha_vals: list[float] = []
    beta_vals: list[float] = []
    gamma_vals: list[float] = []

    for ch in eeg_channels:
        ch_data = data[ch]
        # Returns pair of (avg, stddev) for the band in uV^2/Hz
        delta_avg, _ = DataFilter.get_band_power(ch_data, 0.5, 4.0, sampling_rate, True)
        theta_avg, _ = DataFilter.get_band_power(ch_data, 4.0, 8.0, sampling_rate, True)
        alpha_avg, _ = DataFilter.get_band_power(ch_data, 8.0, 13.0, sampling_rate, True)
        beta_avg, _ = DataFilter.get_band_power(ch_data, 13.0, 30.0, sampling_rate, True)
        gamma_avg, _ = DataFilter.get_band_power(ch_data, 30.0, 50.0, sampling_rate, True)
        delta_vals.append(float(delta_avg))
        theta_vals.append(float(theta_avg))
        alpha_vals.append(float(alpha_avg))
        beta_vals.append(float(beta_avg))
        gamma_vals.append(float(gamma_avg))

    ts = int(float(data[ts_channel][-1]) * 1000)
    s = Snapshot(
        timestamp=ts,
        delta=float(np.mean(delta_vals)),
        theta=float(np.mean(theta_vals)),
        alpha=float(np.mean(alpha_vals)),
        beta=float(np.mean(beta_vals)),
        gamma=float(np.mean(gamma_vals)),
        dominantState="flow",
    )
    s.dominantState = dominant_state(s)
    return s


def run_synthetic_capture(duration_seconds: int, output_pickle: Path, output_csv: Path | None) -> None:
    if not BRAINFLOW_AVAILABLE:
        raise RuntimeError(
            "brainflow is not installed. Install dependencies from backend/requirements.txt first."
        )

    BoardShim.enable_dev_board_logger()
    params = BrainFlowInputParams()
    board = BoardShim(BoardIds.SYNTHETIC_BOARD.value, params)
    sampling_rate = BoardShim.get_sampling_rate(BoardIds.SYNTHETIC_BOARD.value)

    board.prepare_session()
    board.start_stream()
    try:
        windows = max(1, duration_seconds // 2)
        samples: list[dict[str, Any]] = []
        for _ in range(windows):
            time.sleep(2.0)
            snap = aggregate_band_power_2s(board, sampling_rate)
            samples.append(
                {
                    "timestamp": snap.timestamp,
                    "delta": snap.delta,
                    "theta": snap.theta,
                    "alpha": snap.alpha,
                    "beta": snap.beta,
                    "gamma": snap.gamma,
                    "dominantState": snap.dominantState,
                    # CogniShift app-consumed snapshot:
                    "brainwaveSnapshot": {
                        "timestamp": snap.timestamp,
                        "theta": snap.theta,
                        "alpha": snap.alpha,
                        "beta": snap.beta,
                        "gamma": snap.gamma,
                        "dominantState": snap.dominantState,
                    },
                }
            )

        payload = {
            "source": "brainflow.synthetic_board",
            "sample_rate_hz": sampling_rate,
            "window_sec": 2,
            "features": samples,
        }
        output_pickle.parent.mkdir(parents=True, exist_ok=True)
        with output_pickle.open("wb") as f:
            pickle.dump(payload, f)

        if output_csv is not None:
            raw = board.get_board_data()
            DataFilter.write_file(raw, str(output_csv), "w")
    finally:
        board.stop_stream()
        board.release_session()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate BrainFlow synthetic EEG features and write .pickle for model input."
    )
    parser.add_argument("--duration-sec", type=int, default=120)
    parser.add_argument(
        "--pickle-out",
        type=Path,
        default=Path("backend/data/eeg_synthetic_features.pkl"),
    )
    parser.add_argument(
        "--raw-csv-out",
        type=Path,
        default=Path("backend/data/eeg_synthetic_raw.csv"),
    )
    args = parser.parse_args()
    run_synthetic_capture(args.duration_sec, args.pickle_out, args.raw_csv_out)
    print(f"Wrote pickle dataset to: {args.pickle_out}")
    print(f"Wrote raw csv to: {args.raw_csv_out}")


if __name__ == "__main__":
    main()

