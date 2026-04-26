import { Page } from "./_layout";
import { useEffect, useState } from "react";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { assertSupabaseConfigured } from "../features/supabase/client";
import { useSongProfileStore } from "../state/songProfileStore";

export function ProfileRoute() {
  const user = useSupabaseAuthStore((s) => s.user);
  const { listProfiles } = useSongProfileStore();
  const [name, setName] = useState("");
  const [targetStates, setTargetStates] = useState<string[]>([]);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const [baselineSummary, setBaselineSummary] = useState("Not calibrated");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      const supabase = assertSupabaseConfigured();
      const { data } = await supabase
        .from("user_profiles")
        .select("name, target_states, calibration_complete, brainwave_baselines")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) return;
      setName(data.name ?? "");
      setTargetStates(Array.isArray(data.target_states) ? data.target_states : []);
      setCalibrationComplete(Boolean(data.calibration_complete));
      const b = (data.brainwave_baselines ?? {}) as Record<string, number>;
      if (Object.keys(b).length > 0) {
        setBaselineSummary(
          `Jaw ${Number(b.jaw_clench_threshold ?? 150).toFixed(1)} · Blink ${Number(
            b.blink_amplitude_threshold ?? 100,
          ).toFixed(1)} / ${Number(b.blink_duration_threshold_ms ?? 500).toFixed(0)}ms`,
        );
      }
    };
    void run();
  }, [user?.id]);

  const profiles = listProfiles().sort((a, b) => b.listenCount - a.listenCount);

  return (
    <Page title="Profile">
      <div className="card">
        {!user ? (
          <p className="muted">Sign in with Supabase Auth to load your profile.</p>
        ) : (
          <>
            <p className="muted">Account: {user.email ?? user.id}</p>
            <div className="row">
              <input
                style={{ minWidth: 260, padding: 10, borderRadius: 10, border: "1px solid #333" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
              />
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
                        name: name || null,
                        target_states: targetStates,
                        calibration_complete: calibrationComplete,
                      },
                      { onConflict: "id" },
                    );
                    if (error) throw error;
                    setMessage("Profile saved.");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              Calibration: {calibrationComplete ? "Complete" : "Pending"} · {baselineSummary}
            </p>
            {message ? <p className="muted" style={{ marginTop: 8 }}>{message}</p> : null}
          </>
        )}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardTitle">Top learned songs</div>
        {profiles.length === 0 ? (
          <p className="muted">No song profiles yet. Play tracks on Dashboard while EEG is connected.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {profiles.slice(0, 12).map((p) => (
              <li key={p.trackId} style={{ margin: "6px 0" }}>
                <span style={{ fontWeight: 650 }}>{p.trackName}</span>{" "}
                <span className="muted">
                  · {p.artist} · listens {p.listenCount} · state {p.dominantState}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

