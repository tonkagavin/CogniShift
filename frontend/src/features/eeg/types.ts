export type MentalState = "focused" | "happy" | "relaxed" | "sleepy" | "sad" | "neutral";

export type BrainwaveSnapshot = {
  timestamp: number;
  /** Present when backend sends a structured error instead of a snapshot */
  type?: "eeg_error" | "eeg_ready";
  message?: string;
  hint?: string;
  config?: Record<string, unknown>;
  device?: string;
  signalQuality?: number;
  bands?: {
    delta: number;
    theta: number;
    alpha: number;
    beta: number;
    gamma: number;
  };
  dominantBand?: "delta" | "theta" | "alpha" | "beta" | "gamma";
  detectedState?: MentalState;
  engagementScore?: number;
  valenceScore?: number;
  gesture?: GestureType | null;
  delta?: number;
  gamma: number;
  beta: number;
  alpha: number;
  theta: number;
  dominantState: MentalState;
};

export type GestureType = "jawClench" | "longBlink";

