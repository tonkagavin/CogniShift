import { Page } from "./_layout";
import { useEffect, useState } from "react";
import { useEEG } from "../features/eeg/useEEG";
import { EEGVisualizer } from "../components/EEGVisualizer";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { assertSupabaseConfigured } from "../features/supabase/client";

export function CalibrateRoute() {
  const eeg = useEEG();
  const user = useSupabaseAuthStore((s) => s.user);
  const [status, setStatus] = useState("Ready");
  const [history, setHistory] = useState<NonNullable<typeof eeg.snapshot>[]>([]);
  const [results, setResults] = useState<{
    baseline_amplitude: number;
    jaw_clench_threshold: number;
    blink_amplitude_threshold: number;
    blink_duration_threshold_ms: number;
  } | null>(null);

  useEffect(() => {
    if (!eeg.snapshot) return;
    setHistory((prev) => [...prev, eeg.snapshot as NonNullable<typeof eeg.snapshot>].slice(-120));
  }, [eeg.snapshot]);

  const amplitude = () =>
    eeg.snapshot
      ? Math.max(
          Math.abs(eeg.snapshot.alpha),
          Math.abs(eeg.snapshot.beta),
          Math.abs(eeg.snapshot.gamma),
          Math.abs(eeg.snapshot.theta),
        )
      : 0;

  const runCalibration = async () => {
    if (!eeg.isConnected) eeg.connect();
    setStatus("Step 1/3: Baseline (10s)...");
    const baseline: number[] = [];
    const jawPeaks: number[] = [];
    const blinkPeaks: number[] = [];
    const blinkDurations: number[] = [];
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      baseline.push(amplitude());
      await new Promise((r) => setTimeout(r, 200));
    }
    setStatus("Step 2/3: Jaw clench 3 times...");
    for (let i = 0; i < 3; i++) {
      let peak = 0;
      const start = Date.now();
      while (Date.now() - start < 2200) {
        peak = Math.max(peak, amplitude());
        await new Promise((r) => setTimeout(r, 100));
      }
      jawPeaks.push(peak);
    }
    setStatus("Step 3/3: Long blink 3 times...");
    for (let i = 0; i < 3; i++) {
      let peak = 0;
      const start = Date.now();
      while (Date.now() - start < 2200) {
        peak = Math.max(peak, amplitude());
        await new Promise((r) => setTimeout(r, 100));
      }
      blinkPeaks.push(peak);
      blinkDurations.push(700);
    }
    const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const next = {
      baseline_amplitude: mean(baseline),
      jaw_clench_threshold: mean(jawPeaks) * 0.7 || 150,
      blink_amplitude_threshold: mean(blinkPeaks) * 0.7 || 100,
      blink_duration_threshold_ms: mean(blinkDurations) * 0.8 || 500,
    };
    setResults(next);
    setStatus("Calibration complete.");
  };

  return (
    <Page title="Calibration">
      <div className="card">
        <p className="muted">
          Let&apos;s calibrate your gesture controls. We&apos;ll measure your natural signal so controls feel responsive.
        </p>
        <div className="row">
          {!eeg.isConnected ? (
            <button className="btn primary" onClick={eeg.connect}>
              Connect EEG Headset
            </button>
          ) : (
            <button className="btn" onClick={eeg.disconnect}>
              Disconnect EEG
            </button>
          )}
          <button className="btn primary" onClick={() => void runCalibration()}>
            Run calibration
          </button>
          <button
            className="btn"
            disabled={!results || !user?.id}
            onClick={async () => {
              if (!user?.id || !results) return;
              const supabase = assertSupabaseConfigured();
              const { error } = await supabase.from("user_profiles").upsert(
                {
                  id: user.id,
                  calibration_complete: true,
                  brainwave_baselines: {
                    ...results,
                    calibrated_at: new Date().toISOString(),
                  },
                },
                { onConflict: "id" },
              );
              setStatus(error ? `Save failed: ${error.message}` : "Saved to profile.");
            }}
          >
            Save thresholds
          </button>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          {status}
        </p>
        {results ? (
          <p className="muted">
            Baseline {results.baseline_amplitude.toFixed(2)} · Jaw {results.jaw_clench_threshold.toFixed(2)} ·
            Blink {results.blink_amplitude_threshold.toFixed(2)} /{" "}
            {results.blink_duration_threshold_ms.toFixed(0)}ms
          </p>
        ) : null}
        <EEGVisualizer snapshot={eeg.snapshot} history={history} />
      </div>
    </Page>
  );
}

