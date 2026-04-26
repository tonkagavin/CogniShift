import type { BrainwaveSnapshot } from "../eeg/types";
import type { SongProfile } from "./songModels";
import { assertSupabaseConfigured } from "../supabase/client";

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";

type IngestResponse = {
  status: string;
  listenCount?: number;
  profile?: SongProfile;
};

export async function ingestSongProfileSession(input: {
  userId: string;
  trackId: string;
  trackName: string;
  artist: string;
  sessionSnapshots: BrainwaveSnapshot[];
  profile: SongProfile;
}): Promise<IngestResponse> {
  const supabase = assertSupabaseConfigured();
  const devWrite = async (table: string, action: "insert" | "upsert", payload: object) => {
    const query = supabase.from(table);
    const { data, error } =
      action === "insert"
        ? await query.insert(payload as never).select()
        : await query.upsert(payload as never, { onConflict: "user_id,track_id" }).select();
    if (error) {
      console.error(`[Supabase write failed] table=${table}`, error);
    } else {
      console.log(`[Supabase write OK] table=${table}`, data);
    }
    return { data, error };
  };

  const p = input.profile;
  const latestSession = p.eegSessions.at(-1);
  const avgBands = {
    gamma: p.avgBandPower.gamma,
    beta: p.avgBandPower.beta,
    alpha: p.avgBandPower.alpha,
    theta: p.avgBandPower.theta,
  };
  const peakBands = {
    gamma: p.peakBandPower.gamma,
    beta: p.peakBandPower.beta,
    alpha: p.peakBandPower.alpha,
    theta: p.peakBandPower.theta,
  };

  const sessionWrite = await devWrite("eeg_song_sessions", "insert", {
    user_id: input.userId,
    track_id: input.trackId,
    session_payload: {
      date: Date.now(),
      snapshots: latestSession?.snapshots ?? input.sessionSnapshots,
      dominantState: p.dominantState,
      avgBands,
      peakBands,
    },
  });

  const profileWrite = await devWrite("song_profiles", "upsert", {
    user_id: input.userId,
    track_id: input.trackId,
    listen_count: p.listenCount,
    last_updated: new Date().toISOString(),
    profile: {
      trackId: p.trackId,
      trackName: p.trackName,
      artist: p.artist,
      listenCount: p.listenCount,
      avgBandPower: avgBands,
      peakBandPower: peakBands,
      dominantState: p.dominantState,
      engagementScore: p.engagementScore,
      valenceScore: p.valenceScore,
      stabilityScore: p.stabilityScore,
      audioFeatures: null,
    },
  });

  if (!sessionWrite.error && !profileWrite.error) {
    return { status: "ok", listenCount: p.listenCount, profile: p };
  }

  // Fallback to backend ingest endpoint while Supabase write path is stabilizing.
  const res = await fetch(`${backendUrl}/api/song-profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to ingest song profile (${res.status})${text ? `: ${text}` : ""}`);
  }
  return (await res.json()) as IngestResponse;
}
