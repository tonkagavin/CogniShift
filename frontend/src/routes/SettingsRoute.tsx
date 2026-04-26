import { Page } from "./_layout";
import { useEffect, useState } from "react";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { assertSupabaseConfigured } from "../features/supabase/client";

export function SettingsRoute() {
  const user = useSupabaseAuthStore((s) => s.user);
  const [jaw, setJaw] = useState(150);
  const [blinkAmp, setBlinkAmp] = useState(100);
  const [blinkDur, setBlinkDur] = useState(500);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      const supabase = assertSupabaseConfigured();
      const { data } = await supabase
        .from("user_profiles")
        .select("brainwave_baselines")
        .eq("id", user.id)
        .maybeSingle();
      const b = (data?.brainwave_baselines ?? {}) as Record<string, number>;
      setJaw(Number(b.jaw_clench_threshold ?? 150));
      setBlinkAmp(Number(b.blink_amplitude_threshold ?? 100));
      setBlinkDur(Number(b.blink_duration_threshold_ms ?? 500));
    };
    void run();
  }, [user?.id]);

  return (
    <Page title="Settings">
      <div className="card">
        {!user ? (
          <p className="muted">Sign in to save gesture and calibration preferences.</p>
        ) : (
          <>
            <div className="cardTitle">Gesture thresholds</div>
            <div className="row">
              <label className="muted">
                Jaw clench amplitude
                <input
                  type="number"
                  value={jaw}
                  onChange={(e) => setJaw(Number(e.target.value))}
                  style={{ marginLeft: 8, padding: 8, borderRadius: 8, border: "1px solid #333", width: 110 }}
                />
              </label>
              <label className="muted">
                Blink amplitude
                <input
                  type="number"
                  value={blinkAmp}
                  onChange={(e) => setBlinkAmp(Number(e.target.value))}
                  style={{ marginLeft: 8, padding: 8, borderRadius: 8, border: "1px solid #333", width: 110 }}
                />
              </label>
              <label className="muted">
                Blink duration ms
                <input
                  type="number"
                  value={blinkDur}
                  onChange={(e) => setBlinkDur(Number(e.target.value))}
                  style={{ marginLeft: 8, padding: 8, borderRadius: 8, border: "1px solid #333", width: 110 }}
                />
              </label>
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  setJaw(150);
                  setBlinkAmp(100);
                  setBlinkDur(500);
                }}
              >
                Reset defaults
              </button>
              <button
                className="btn primary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setMessage(null);
                  try {
                    const supabase = assertSupabaseConfigured();
                    const { error } = await supabase.from("user_profiles").upsert(
                      {
                        id: user.id,
                        brainwave_baselines: {
                          jaw_clench_threshold: jaw,
                          blink_amplitude_threshold: blinkAmp,
                          blink_duration_threshold_ms: blinkDur,
                          calibrated_at: new Date().toISOString(),
                        },
                      },
                      { onConflict: "id" },
                    );
                    if (error) throw error;
                    setMessage("Settings saved.");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
            {message ? <p className="muted" style={{ marginTop: 10 }}>{message}</p> : null}
          </>
        )}
      </div>
    </Page>
  );
}

