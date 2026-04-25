export type MentalState = "focused" | "happy" | "relaxed" | "sleepy" | "sad" | "neutral";

export type BrainwaveSnapshot = {
  timestamp: number;
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

