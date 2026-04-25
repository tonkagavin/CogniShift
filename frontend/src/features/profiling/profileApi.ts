import type { BrainwaveSnapshot } from "../eeg/types";
import type { SongProfile } from "./songModels";

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
}): Promise<IngestResponse> {
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
