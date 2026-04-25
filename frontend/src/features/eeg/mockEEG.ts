import type { BrainwaveSnapshot, GestureType, MentalState } from "./types";

export type EEGEvent =
  | { type: "snapshot"; snapshot: BrainwaveSnapshot }
  | { type: "gesture"; gesture: GestureType; timestamp: number }
  | { type: "status"; isConnected: boolean };

export type EEGEmitter = {
  connect: () => void;
  disconnect: () => void;
  subscribe: (cb: (ev: EEGEvent) => void) => () => void;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function dominantFromBands(s: Omit<BrainwaveSnapshot, "dominantState">): MentalState {
  const bands: Array<[MentalState, number]> = [
    ["focused", s.gamma],
    ["happy", (s.alpha + s.beta) / 2],
    ["relaxed", s.alpha],
    ["sleepy", s.theta],
  ];
  bands.sort((a, b) => b[1] - a[1]);
  return bands[0][0];
}

export function createMockEEGEmitter({
  intervalMs = 500,
}: {
  intervalMs?: number;
} = {}): EEGEmitter {
  const listeners = new Set<(ev: EEGEvent) => void>();

  let isConnected = false;
  let timer: number | null = null;
  let t = 0;

  let lastJawMs = 0;
  let lastBlinkMs = 0;

  const emit = (ev: EEGEvent) => {
    for (const cb of listeners) cb(ev);
  };

  const tick = () => {
    t += intervalMs / 1000;
    const now = Date.now();

    // Smooth-ish band values with a gentle drift
    const gamma = clamp01(0.55 + 0.18 * Math.sin(t * 1.1) + 0.06 * Math.sin(t * 3.7));
    const beta = clamp01(0.50 + 0.16 * Math.sin(t * 0.9 + 1.2));
    const alpha = clamp01(0.45 + 0.18 * Math.sin(t * 0.75 + 2.6));
    const theta = clamp01(0.35 + 0.14 * Math.sin(t * 0.55 + 0.4));

    const base = { timestamp: now, gamma, beta, alpha, theta };
    const snapshot: BrainwaveSnapshot = {
      ...base,
      dominantState: dominantFromBands(base),
    };

    emit({ type: "snapshot", snapshot });

    // Rare gesture events with debouncing rules from spec
    const r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    if (r < 0.004 && now - lastJawMs > 800) {
      lastJawMs = now;
      emit({ type: "gesture", gesture: "jawClench", timestamp: now });
    }
    if (r > 0.996 && now - lastBlinkMs > 1200) {
      lastBlinkMs = now;
      emit({ type: "gesture", gesture: "longBlink", timestamp: now });
    }
  };

  return {
    connect: () => {
      if (isConnected) return;
      isConnected = true;
      emit({ type: "status", isConnected: true });
      timer = window.setInterval(tick, intervalMs);
    },
    disconnect: () => {
      if (!isConnected) return;
      isConnected = false;
      emit({ type: "status", isConnected: false });
      if (timer) window.clearInterval(timer);
      timer = null;
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

