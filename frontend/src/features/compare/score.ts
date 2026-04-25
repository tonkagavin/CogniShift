import type { BrainwaveSnapshot } from "../eeg/types";
import type { SongProfile } from "../profiling/songModels";

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

export function alignmentScore(live: BrainwaveSnapshot, profile?: SongProfile): number {
  if (!profile) return 0;
  const a = [live.gamma, live.beta, live.alpha, live.theta];
  const b = [
    profile.avgBandPower.gamma,
    profile.avgBandPower.beta,
    profile.avgBandPower.alpha,
    profile.avgBandPower.theta,
  ];
  return clamp01((cosineSimilarity(a, b) + 1) / 2);
}

