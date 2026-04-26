import { Page } from "./_layout";
import { useEffect, useMemo, useState } from "react";
import { useSongProfileStore } from "../state/songProfileStore";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { assertSupabaseConfigured } from "../features/supabase/client";
import type { SongProfile } from "../features/profiling/songModels";

export function LibraryRoute() {
  const user = useSupabaseAuthStore((s) => s.user);
  const { listProfiles, upsertProfile } = useSongProfileStore();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const supabase = assertSupabaseConfigured();
        const { data } = await supabase
          .from("song_profiles")
          .select("profile")
          .eq("user_id", user.id);
        for (const row of data ?? []) {
          const p = row.profile as SongProfile | undefined;
          if (p?.trackId) upsertProfile(p);
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [upsertProfile, user?.id]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listProfiles()
      .filter((p) => !q || p.trackName.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q))
      .sort((a, b) => b.listenCount - a.listenCount);
  }, [listProfiles, query]);

  return (
    <Page title="Library">
      <div className="card">
        <div className="row" style={{ marginTop: 0 }}>
          <input
            style={{ minWidth: 280, padding: 10, borderRadius: 10, border: "1px solid #333" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search track or artist"
          />
          {loading ? <span className="muted">Loading from Supabase…</span> : null}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardTitle">Song Profiles</div>
        {rows.length === 0 ? (
          <p className="muted">No profiles yet. Play songs on Dashboard to build your library.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rows.map((p) => (
              <li key={p.trackId} style={{ margin: "8px 0" }}>
                <span style={{ fontWeight: 650 }}>{p.trackName}</span>{" "}
                <span className="muted">
                  · {p.artist} · listens {p.listenCount} · engagement {p.engagementScore.toFixed(2)} ·
                  stability {p.stabilityScore.toFixed(2)} · {p.dominantState}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

