import type { BandPowerProfile } from "./songModels";
import type { BrainwaveSnapshot, MentalState } from "../eeg/types";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function avgBandPower(snapshots: BrainwaveSnapshot[]): BandPowerProfile {
  if (snapshots.length === 0) return { gamma: 0, beta: 0, alpha: 0, theta: 0 };
  const sum = snapshots.reduce(
    (acc, s) => {
      acc.gamma += s.gamma;
      acc.beta += s.beta;
      acc.alpha += s.alpha;
      acc.theta += s.theta;
      return acc;
    },
    { gamma: 0, beta: 0, alpha: 0, theta: 0 },
  );
  return {
    gamma: sum.gamma / snapshots.length,
    beta: sum.beta / snapshots.length,
    alpha: sum.alpha / snapshots.length,
    theta: sum.theta / snapshots.length,
  };
}

export function peakBandPower(snapshots: BrainwaveSnapshot[]): BandPowerProfile {
  return snapshots.reduce(
    (acc, s) => ({
      gamma: Math.max(acc.gamma, s.gamma),
      beta: Math.max(acc.beta, s.beta),
      alpha: Math.max(acc.alpha, s.alpha),
      theta: Math.max(acc.theta, s.theta),
    }),
    { gamma: 0, beta: 0, alpha: 0, theta: 0 },
  );
}

export function dominantStateFromSnapshots(snapshots: BrainwaveSnapshot[]): MentalState {
  const counts = new Map<MentalState, number>();
  for (const s of snapshots) counts.set(s.dominantState, (counts.get(s.dominantState) ?? 0) + 1);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? "flow";
}

export function engagementScoreFromBands(avg: BandPowerProfile): number {
  // gamma/theta derived, scaled into 0..1 for UI ranking
  const ratio = avg.theta <= 1e-6 ? avg.gamma : avg.gamma / avg.theta;
  return clamp01(ratio / 3.0);
}

export function valenceScoreFromBands(avg: BandPowerProfile): number {
  // alpha/beta derived, scaled into 0..1
  const ratio = avg.beta <= 1e-6 ? avg.alpha : avg.alpha / avg.beta;
  return clamp01(ratio / 2.5);
}

export function stabilityScoreFromSnapshots(snapshots: BrainwaveSnapshot[]): number {
  if (snapshots.length < 3) return 0.25;
  const avg = avgBandPower(snapshots);
  const vars = snapshots.reduce(
    (acc, s) => {
      acc.gamma += (s.gamma - avg.gamma) ** 2;
      acc.beta += (s.beta - avg.beta) ** 2;
      acc.alpha += (s.alpha - avg.alpha) ** 2;
      acc.theta += (s.theta - avg.theta) ** 2;
      return acc;
    },
    { gamma: 0, beta: 0, alpha: 0, theta: 0 },
  );
  const v =
    (vars.gamma + vars.beta + vars.alpha + vars.theta) / (4 * (snapshots.length - 1));
  // lower variance => higher stability
  return clamp01(1 - Math.sqrt(v));
}

