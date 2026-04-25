import type { BrainwaveSnapshot, MentalState } from "../eeg/types";

export type BandPowerProfile = {
  gamma: number;
  beta: number;
  alpha: number;
  theta: number;
};

export type EEGSongSession = {
  date: number;
  snapshots: BrainwaveSnapshot[];
  dominantState: MentalState;
};

export type SongProfile = {
  trackId: string;
  trackName: string;
  artist: string;
  listenCount: number;
  avgBandPower: BandPowerProfile;
  peakBandPower: BandPowerProfile;
  dominantState: MentalState;
  engagementScore: number;
  valenceScore: number;
  stabilityScore: number;
  lastUpdated: number;
  eegSessions: EEGSongSession[];
};

