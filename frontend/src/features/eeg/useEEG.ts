import { useEffect, useMemo, useRef, useState } from "react";
import type { BrainwaveSnapshot, GestureType } from "./types";
import { createMockEEGEmitter, type EEGEmitter, type EEGEvent } from "./mockEEG";

export type UseEEGState = {
  isConnected: boolean;
  snapshot: BrainwaveSnapshot | null;
  gestureDetected: { type: GestureType; timestamp: number } | null;
  source: "mock" | "neuropawn";
  connect: () => void;
  disconnect: () => void;
};

export function useEEG(): UseEEGState {
  const emitter: EEGEmitter = useMemo(() => createMockEEGEmitter({ intervalMs: 500 }), []);
  const [isConnected, setIsConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<BrainwaveSnapshot | null>(null);
  const [gestureDetected, setGestureDetected] = useState<UseEEGState["gestureDetected"]>(null);

  const lastGestureRef = useRef<{ type: GestureType; timestamp: number } | null>(null);

  useEffect(() => {
    const unsub = emitter.subscribe((ev: EEGEvent) => {
      if (ev.type === "status") setIsConnected(ev.isConnected);
      if (ev.type === "snapshot") setSnapshot(ev.snapshot);
      if (ev.type === "gesture") {
        const g = { type: ev.gesture, timestamp: ev.timestamp };
        lastGestureRef.current = g;
        setGestureDetected(g);
        window.setTimeout(() => {
          if (lastGestureRef.current?.timestamp === g.timestamp) setGestureDetected(null);
        }, 1200);
      }
    });

    return () => {
      unsub();
      emitter.disconnect();
    };
  }, [emitter]);

  return {
    isConnected,
    snapshot,
    gestureDetected,
    source: "mock",
    connect: () => emitter.connect(),
    disconnect: () => emitter.disconnect(),
  };
}

