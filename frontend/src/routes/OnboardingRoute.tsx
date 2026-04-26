import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Page } from "./_layout";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { assertSupabaseConfigured } from "../features/supabase/client";
import { useEEG } from "../features/eeg/useEEG";
import { EEGVisualizer } from "../components/EEGVisualizer";

type TargetState = "focused" | "happy" | "relaxed" | "sleepy" | "sad";

const DEFAULT_THRESHOLDS = {
  baseline_amplitude: 0,
  jaw_clench_threshold: 150,
  blink_amplitude_threshold: 100,
  blink_duration_threshold_ms: 500,
};

function amplitudeOf(snapshot: ReturnType<typeof useEEG>["snapshot"]): number {
  if (!snapshot) return 0;
  return Math.max(Math.abs(snapshot.alpha), Math.abs(snapshot.beta), Math.abs(snapshot.gamma), Math.abs(snapshot.theta));
}

export function OnboardingRoute() {
  const user = useSupabaseAuthStore((s) => s.user);
  const navigate = useNavigate();
  const eeg = useEEG();
  const supabase = useMemo(() => assertSupabaseConfigured(), []);
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.name ?? "");
  const [targetStates, setTargetStates] = useState<TargetState[]>([]);
  const [baselines, setBaselines] = useState(DEFAULT_THRESHOLDS);
  const [calibrationStatus, setCalibrationStatus] = useState<string>("Not started");
  const [history, setHistory] = useState<NonNullable<ReturnType<typeof useEEG>["snapshot"]>[]>([]);

  if (!user) return <Navigate to="/" replace />;

  const persistProfile = async (updates: Record<string, unknown>) => {
    const payload = {
      id: user.id,
      name: displayName || null,
      calibration_complete: false,
      ...updates,
    };
    const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "id" });
    if (error) throw error;
  };

  useEffect(() => {
    if (!eeg.snapshot) return;
    setHistory((prev) => [...prev, eeg.snapshot as NonNullable<typeof eeg.snapshot>].slice(-80));
  }, [eeg.snapshot]);

  const runCalibration = async () => {
    if (!eeg.isConnected) eeg.connect();
    setCalibrationStatus("Collecting baseline...");
    const baselineSamples: number[] = [];
    const jawPeaks: number[] = [];
    const blinkPeaks: number[] = [];
    const blinkDurations: number[] = [];
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      baselineSamples.push(amplitudeOf(eeg.snapshot));
      await new Promise((r) => setTimeout(r, 200));
    }
    setCalibrationStatus("Capture 3 jaw clenches now...");
    for (let i = 0; i < 3; i++) {
      let peak = 0;
      const start = Date.now();
      while (Date.now() - start < 2_500) {
        peak = Math.max(peak, amplitudeOf(eeg.snapshot));
        await new Promise((r) => setTimeout(r, 100));
      }
      jawPeaks.push(peak);
    }
    setCalibrationStatus("Capture 3 long blinks now...");
    for (let i = 0; i < 3; i++) {
      let peak = 0;
      const start = Date.now();
      while (Date.now() - start < 2_500) {
        peak = Math.max(peak, amplitudeOf(eeg.snapshot));
        await new Promise((r) => setTimeout(r, 100));
      }
      blinkPeaks.push(peak);
      blinkDurations.push(700);
    }
    const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const next = {
      baseline_amplitude: mean(baselineSamples),
      jaw_clench_threshold: mean(jawPeaks) * 0.7 || 150,
      blink_amplitude_threshold: mean(blinkPeaks) * 0.7 || 100,
      blink_duration_threshold_ms: mean(blinkDurations) * 0.8 || 500,
    };
    setBaselines(next);
    setCalibrationStatus("Calibration complete");
  };

  return (
    <Page title="Onboarding">
      <div className="card">
        {step === 1 ? (
          <>
            <div className="cardTitle">Welcome</div>
            <p className="muted">Welcome to CogniShift. Let&apos;s set up your profile.</p>
            <div className="row">
              <input
                style={{ minWidth: 320, padding: 10, borderRadius: 10, border: "1px solid #333" }}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
              />
              <button
                className="btn primary"
                onClick={async () => {
                  await persistProfile({ name: displayName || null });
                  setStep(2);
                }}
              >
                Continue
              </button>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <div className="cardTitle">Headset Setup</div>
            <p className="muted">Connect your Neuropawn Knight via USB. Continue once signal quality is stable.</p>
            <div className="row">
              {!eeg.isConnected ? (
                <button className="btn primary" onClick={eeg.connect}>Connect EEG Headset</button>
              ) : (
                <button className="btn" onClick={eeg.disconnect}>Disconnect EEG</button>
              )}
              <button className="btn" onClick={() => setStep(4)}>Skip for now</button>
              <button
                className="btn primary"
                disabled={(eeg.snapshot?.signalQuality ?? 0) <= 60}
                onClick={() => setStep(3)}
              >
                Continue
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Signal quality: {eeg.snapshot?.signalQuality ?? 0}%
            </p>
            <EEGVisualizer snapshot={eeg.snapshot} history={history} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <div className="cardTitle">Gesture Calibration</div>
            <p className="muted">
              Let&apos;s calibrate your gesture controls. We&apos;ll measure your natural signal so controls feel responsive.
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => void runCalibration()}>Run calibration</button>
              <button className="btn" onClick={() => setStep(4)}>Skip calibration</button>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>{calibrationStatus}</p>
            <p className="muted">
              Baseline {baselines.baseline_amplitude.toFixed(2)} · Jaw {baselines.jaw_clench_threshold.toFixed(2)} · Blink{" "}
              {baselines.blink_amplitude_threshold.toFixed(2)} / {baselines.blink_duration_threshold_ms.toFixed(0)}ms
            </p>
            <EEGVisualizer snapshot={eeg.snapshot} history={history} />
          </>
        ) : null}
        {step === 4 ? (
          <>
            <div className="cardTitle">Target State Selection</div>
            <p className="muted">What do you want CogniShift to help you with?</p>
            <div className="row">
              {[
                { key: "focused", label: "Focus & Productivity" },
                { key: "happy", label: "Happy & Energized" },
                { key: "relaxed", label: "Calm & Relaxed" },
                { key: "sleepy", label: "Wind Down & Sleep" },
                { key: "sad", label: "Process & Reflect" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  className={`btn ${targetStates.includes(opt.key as TargetState) ? "primary" : ""}`}
                  onClick={() =>
                    setTargetStates((prev) =>
                      prev.includes(opt.key as TargetState)
                        ? prev.filter((v) => v !== opt.key)
                        : [...prev, opt.key as TargetState],
                    )
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="row">
              <button
                className="btn primary"
                onClick={async () => {
                  await persistProfile({
                    calibration_complete: true,
                    brainwave_baselines: {
                      ...DEFAULT_THRESHOLDS,
                      ...baselines,
                      calibrated_at: new Date().toISOString(),
                    },
                    target_states: targetStates,
                  });
                  navigate("/dashboard", { replace: true });
                }}
              >
                Finish setup
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Page>
  );
}
