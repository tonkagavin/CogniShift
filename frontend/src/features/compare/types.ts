import type { BrainwaveSnapshot, MentalState } from "../eeg/types";
import type { QueueEntry } from "../queue/recommender";

export type ShuffleComparisonSession = {
  sessionId: string;
  startTime: number;
  endTime: number;
  targetState: MentalState;
  brainwaveQueue: QueueEntry[];
  randomQueue: QueueEntry[];
  eegTimeline: BrainwaveSnapshot[];
  summary: ComparisonSummary;
};

export type ComparisonSummary = {
  avgAlignmentScore: { brainwave: number; random: number };
  timeInTargetState: { brainwave: number; random: number };
  avgEngagement: { brainwave: number; random: number };
  skipCount: { brainwave: number; random: number };
  winner: "brainwave" | "random" | "tie";
  winnerReason: string;
};

