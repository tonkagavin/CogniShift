import type { BrainwaveSnapshot } from "../eeg/types";
import type { SongProfile, EEGSongSession } from "./songModels";
import {
  avgBandPower,
  dominantStateFromSnapshots,
  engagementScoreFromBands,
  peakBandPower,
  stabilityScoreFromSnapshots,
  valenceScoreFromBands,
} from "./metrics";

export type TrackIdentity = {
  trackId: string;
  trackName: string;
  artist: string;
};

export type RecorderOptions = {
  minListenMs?: number; // default 30s
};

export class SongProfileRecorder {
  private minListenMs: number;
  private active:
    | {
        track: TrackIdentity;
        startedAt: number;
        snapshots: BrainwaveSnapshot[];
      }
    | null = null;

  constructor(opts: RecorderOptions = {}) {
    this.minListenMs = opts.minListenMs ?? 30_000;
  }

  start(track: TrackIdentity) {
    this.active = { track, startedAt: Date.now(), snapshots: [] };
  }

  pushSnapshot(snapshot: BrainwaveSnapshot) {
    if (!this.active) return;
    this.active.snapshots.push(snapshot);
  }

  stopAndBuildProfile(previous?: SongProfile): SongProfile | null {
    if (!this.active) return null;
    const endedAt = Date.now();
    const { track, startedAt, snapshots } = this.active;
    this.active = null;

    if (endedAt - startedAt < this.minListenMs || snapshots.length < 3) {
      return null;
    }

    const avg = avgBandPower(snapshots);
    const peak = peakBandPower(snapshots);
    const dominant = dominantStateFromSnapshots(snapshots);

    const session: EEGSongSession = {
      date: endedAt,
      snapshots,
      dominantState: dominant,
    };

    const base: SongProfile = previous ?? {
      trackId: track.trackId,
      trackName: track.trackName,
      artist: track.artist,
      listenCount: 0,
      avgBandPower: avg,
      peakBandPower: peak,
      dominantState: dominant,
      engagementScore: engagementScoreFromBands(avg),
      valenceScore: valenceScoreFromBands(avg),
      stabilityScore: stabilityScoreFromSnapshots(snapshots),
      lastUpdated: endedAt,
      eegSessions: [],
    };

    const listenCount = base.listenCount + 1;
    const nextSessions = [...base.eegSessions, session].slice(-20);

    // Recompute aggregate averages over sessions for stability
    const allSnapshots = nextSessions.flatMap((s) => s.snapshots);
    const aggAvg = avgBandPower(allSnapshots);
    const aggPeak = peakBandPower(allSnapshots);
    const aggDominant = dominantStateFromSnapshots(allSnapshots);

    return {
      ...base,
      listenCount,
      avgBandPower: aggAvg,
      peakBandPower: aggPeak,
      dominantState: aggDominant,
      engagementScore: engagementScoreFromBands(aggAvg),
      valenceScore: valenceScoreFromBands(aggAvg),
      stabilityScore: stabilityScoreFromSnapshots(allSnapshots),
      lastUpdated: endedAt,
      eegSessions: nextSessions,
    };
  }
}

