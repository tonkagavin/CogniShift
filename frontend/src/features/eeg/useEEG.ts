import { useEffect, useRef, useState } from "react";
import type { BrainwaveSnapshot, GestureType } from "./types";

export type UseEEGState = {
  isConnected: boolean;
  snapshot: BrainwaveSnapshot | null;
  gestureDetected: { type: GestureType; timestamp: number } | null;
  source: "estimated" | "live";
  estimatedMode: boolean;
  hardwareError: string | null;
  /** Shown after hardware connects, before first snapshot arrives */
  streamStatus: string | null;
  connect: () => void;
  disconnect: () => void;
};

export function useEEG(): UseEEGState {
  const wsUrl = import.meta.env.VITE_EEG_WS_URL ?? "ws://127.0.0.1:8000/ws/eeg";
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<BrainwaveSnapshot | null>(null);
  const [estimatedMode, setEstimatedMode] = useState(true);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [gestureDetected, setGestureDetected] = useState<UseEEGState["gestureDetected"]>(null);

  const lastGestureRef = useRef<{ type: GestureType; timestamp: number } | null>(null);

  const inferEstimatedState = (): BrainwaveSnapshot => {
    const now = new Date();
    const hour = now.getHours();
    const weekday = now.getDay();
    let dominantState: BrainwaveSnapshot["dominantState"] = "relaxed";
    if (hour >= 6 && hour < 12) dominantState = "focused";
    else if (hour >= 12 && hour < 18) dominantState = "flowState";
    else if (hour >= 18 && hour < 23) dominantState = "relaxed";
    else dominantState = "sleepy";
    // Weekend afternoons tend less focus-oriented.
    if (weekday === 0 || weekday === 6) {
      dominantState = hour < 17 ? "relaxed" : dominantState;
    }
    return {
      timestamp: Date.now(),
      device: "estimated",
      signalQuality: 0,
      dominantBand:
        dominantState === "flowState"
          ? "gamma"
          : dominantState === "focused"
            ? "beta"
            : dominantState === "sleepy"
              ? "theta"
              : "alpha",
      dominantState,
      detectedState: dominantState,
      bands: {
        theta: dominantState === "sleepy" ? 1.4 : 0.5,
        alpha: dominantState === "relaxed" ? 1.6 : 0.8,
        beta: dominantState === "focused" ? 1.4 : 0.7,
        gamma: dominantState === "flowState" ? 1.4 : 0.6,
      },
      theta: dominantState === "sleepy" ? 1.4 : 0.5,
      alpha: dominantState === "relaxed" ? 1.6 : 0.8,
      beta: dominantState === "focused" ? 1.4 : 0.7,
      gamma: dominantState === "flowState" ? 1.4 : 0.6,
      engagementScore: dominantState === "focused" || dominantState === "flowState" ? 1.8 : 0.8,
      valenceScore: dominantState === "relaxed" ? 1.2 : 0.9,
      gesture: null,
    };
  };

  const connect = () => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      setHardwareError(null);
      setStreamStatus("Connecting to EEG backend…");
      setIsConnected(false);
      setEstimatedMode(true);
    };
    ws.onerror = () => {
      setIsConnected(false);
      setEstimatedMode(true);
      setStreamStatus(null);
      setHardwareError("WebSocket error (is backend running and CORS/URL correct?)");
      setSnapshot(inferEstimatedState());
    };
    ws.onclose = () => {
      setIsConnected(false);
      setEstimatedMode(true);
      setStreamStatus(null);
      setSnapshot(inferEstimatedState());
    };
    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as BrainwaveSnapshot & {
          type?: string;
          message?: string;
          hint?: string;
          sampleWindowSeconds?: number;
          minIntervalSeconds?: number;
        };
        if (payload.type === "eeg_ready") {
          setHardwareError(null);
          const minInt = payload.minIntervalSeconds ?? Math.max(1, payload.sampleWindowSeconds ?? 2);
          setStreamStatus(
            `${payload.message ?? "EEG stream ready."} (snapshots every ~${minInt}s once the buffer has samples)`,
          );
          setIsConnected(true);
          setEstimatedMode(false);
          return;
        }
        if (payload.type === "eeg_error") {
          const cfg =
            "config" in payload && payload.config && typeof payload.config === "object"
              ? JSON.stringify(payload.config as Record<string, unknown>)
              : "";
          const msg = [payload.message, cfg || null, payload.hint].filter(Boolean).join(" — ");
          setHardwareError(msg || "EEG hardware error");
          setIsConnected(false);
          setEstimatedMode(true);
          setStreamStatus(null);
          setSnapshot({
            ...inferEstimatedState(),
            type: "eeg_error",
            message: payload.message,
            hint: payload.hint,
            device: "hardware_error",
          });
          return;
        }
        const normalized: BrainwaveSnapshot = {
          ...payload,
          timestamp:
            typeof payload.timestamp === "number" && payload.timestamp < 1e12
              ? Math.floor(payload.timestamp * 1000)
              : payload.timestamp,
          dominantState: payload.detectedState ?? payload.dominantState ?? "relaxed",
          theta: payload.theta ?? payload.bands?.theta ?? 0,
          alpha: payload.alpha ?? payload.bands?.alpha ?? 0,
          beta: payload.beta ?? payload.bands?.beta ?? 0,
          gamma: payload.gamma ?? payload.bands?.gamma ?? 0,
        };
        setHardwareError(null);
        setStreamStatus(null);
        setIsConnected(true);
        setEstimatedMode(false);
        setSnapshot(normalized);
        if (normalized.gesture) {
          const g = { type: normalized.gesture, timestamp: Date.now() };
          lastGestureRef.current = g;
          setGestureDetected(g);
          window.setTimeout(() => {
            if (lastGestureRef.current?.timestamp === g.timestamp) setGestureDetected(null);
          }, 1200);
        }
      } catch {
        // ignore malformed payload
      }
    };
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setEstimatedMode(true);
    setHardwareError(null);
    setStreamStatus(null);
    setSnapshot(inferEstimatedState());
  };

  useEffect(() => {
    setSnapshot(inferEstimatedState());
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    isConnected,
    snapshot,
    gestureDetected,
    source: estimatedMode ? "estimated" : "live",
    estimatedMode,
    hardwareError,
    streamStatus,
    connect,
    disconnect,
  };
}

