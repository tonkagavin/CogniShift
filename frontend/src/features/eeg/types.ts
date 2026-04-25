export type MentalState = "focus" | "flow" | "relax" | "sleep";

export type BrainwaveSnapshot = {
  timestamp: number;
  gamma: number;
  beta: number;
  alpha: number;
  theta: number;
  dominantState: MentalState;
};

export type GestureType = "jaw_clench" | "long_blink";

