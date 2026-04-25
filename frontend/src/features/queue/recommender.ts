import type { BrainwaveSnapshot, MentalState } from "../eeg/types";
import type { SongProfile } from "../profiling/songModels";

export type MusicPrediction = {
  trackId: string;
  trackName: string;
  confidence: number; // 0..1
  targetState: MentalState;
  eegMode: "live" | "estimated";
  matchBand: "gamma" | "beta" | "alpha" | "theta";
};

export type QueueEntry = {
  trackId: string;
  trackName: string;
  source: "brainwave" | "random";
  predictedAlignment: number; // 0..1
  songProfile?: SongProfile;
  matchBand?: MusicPrediction["matchBand"];
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const na = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2 + a[3] ** 2);
  const nb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2 + b[3] ** 2);
  if (na <= 1e-9 || nb <= 1e-9) return 0;
  return dot / (na * nb);
}

function driverBand(live: BrainwaveSnapshot, profile: SongProfile): MusicPrediction["matchBand"] {
  const deltas: Array<[MusicPrediction["matchBand"], number]> = [
    ["gamma", Math.abs(live.gamma - profile.avgBandPower.gamma)],
    ["beta", Math.abs(live.beta - profile.avgBandPower.beta)],
    ["alpha", Math.abs(live.alpha - profile.avgBandPower.alpha)],
    ["theta", Math.abs(live.theta - profile.avgBandPower.theta)],
  ];
  deltas.sort((a, b) => a[1] - b[1]);
  return deltas[0][0];
}

export function recommendQueue({
  live,
  profiles,
  targetState,
  recentTrackIds = [],
  limit = 5,
  noveltyChance = 0.12,
}: {
  live: BrainwaveSnapshot;
  profiles: SongProfile[];
  targetState: MentalState;
  recentTrackIds?: string[];
  limit?: number;
  noveltyChance?: number;
}): QueueEntry[] {
  const liveVec = [live.gamma, live.beta, live.alpha, live.theta];

  const scored = profiles.map((p) => {
    const pVec = [p.avgBandPower.gamma, p.avgBandPower.beta, p.avgBandPower.alpha, p.avgBandPower.theta];
    const sim = clamp01((cosineSimilarity(liveVec, pVec) + 1) / 2);

    const recencyPenalty = recentTrackIds.includes(p.trackId) ? 0.25 : 1.0;
    const confidencePenalty = p.listenCount < 2 ? 0.85 : 1.0;

    // Target state bias: nudge based on profile dominantState
    const targetBoost = p.dominantState === targetState ? 1.12 : 1.0;

    const qualityBoost = 0.65 + 0.35 * clamp01((p.engagementScore + p.stabilityScore) / 2);

    const score = sim * recencyPenalty * confidencePenalty * targetBoost * qualityBoost;
    return { p, sim, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Novelty: occasionally lift a less-played but still decent match into the list
  const rng = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  if (rng < noveltyChance) {
    const candidates = scored
      .slice(0, Math.min(20, scored.length))
      .filter((x) => x.p.listenCount < 4);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor((rng / noveltyChance) * candidates.length) % candidates.length];
      scored.unshift(pick);
    }
  }

  const chosen: QueueEntry[] = [];
  for (const s of scored) {
    if (chosen.length >= limit) break;
    if (chosen.some((c) => c.trackId === s.p.trackId)) continue;
    chosen.push({
      trackId: s.p.trackId,
      trackName: s.p.trackName,
      source: "brainwave",
      predictedAlignment: clamp01(s.score),
      songProfile: s.p,
      matchBand: driverBand(live, s.p),
    });
  }

  return chosen;
}

