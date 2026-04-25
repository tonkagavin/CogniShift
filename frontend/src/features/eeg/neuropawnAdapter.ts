import type { BrainwaveSnapshot, GestureType } from "./types";

export type EEGEvent =
  | { type: "snapshot"; snapshot: BrainwaveSnapshot }
  | { type: "gesture"; gesture: GestureType; timestamp: number }
  | { type: "status"; isConnected: boolean }
  | { type: "error"; message: string };

export type EEGEmitter = {
  connect: () => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  subscribe: (cb: (ev: EEGEvent) => void) => () => void;
};

/**
 * Neuropawn/BrainFlow adapter seam.
 *
 * This file defines the *contract* the app expects (event-driven; no polling).
 * Implementation notes when wiring neuropawn:
 * - connect(): initialize device + start stream.
 * - subscribe(): register callback to be invoked from neuropawn event emitter(s).
 * - emit snapshot events at a fixed cadence (e.g., every 2s) for band power.
 * - emit gesture events when neuropawn detects artifacts (jaw clench / long blink).
 * - disconnect(): stop stream + release device.
 *
 * Once neuropawn JS APIs are available in this repo, replace this stub with a real adapter.
 */
export function createNeuropawnEEGEmitter(): EEGEmitter {
  const listeners = new Set<(ev: EEGEvent) => void>();
  const emit = (ev: EEGEvent) => listeners.forEach((l) => l(ev));

  return {
    connect: async () => {
      emit({
        type: "error",
        message:
          "Neuropawn adapter not implemented yet. Use the mock EEG connector for development.",
      });
      emit({ type: "status", isConnected: false });
    },
    disconnect: async () => {
      emit({ type: "status", isConnected: false });
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

