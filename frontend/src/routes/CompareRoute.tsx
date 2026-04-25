import { Page } from "./_layout";
import { useEffect, useMemo, useState } from "react";
import { useEEG } from "../features/eeg/useEEG";
import { useSongProfileStore } from "../state/songProfileStore";
import { buildRandomShadowQueue } from "../features/queue/randomQueue";
import { recommendQueue, type QueueEntry } from "../features/queue/recommender";
import type { ShuffleComparisonSession } from "../features/compare/types";
import { alignmentScore } from "../features/compare/score";

export function CompareRoute() {
  const eeg = useEEG();
  const { listProfiles, profiles: profileMap } = useSongProfileStore();
  const [mode, setMode] = useState<"random" | "brainwave" | "compare">("compare");

  const allProfiles = useMemo(() => listProfiles(), [listProfiles, profileMap]);
  const [brainwaveQueue, setBrainwaveQueue] = useState<QueueEntry[]>([]);
  const [randomQueue, setRandomQueue] = useState<QueueEntry[]>([]);

  const [activeSession, setActiveSession] = useState<ShuffleComparisonSession | null>(null);
  const [skipCount, setSkipCount] = useState<{ brainwave: number; random: number }>({
    brainwave: 0,
    random: 0,
  });

  useEffect(() => {
    const live = eeg.snapshot;
    if (!live) return;
    if (allProfiles.length === 0) return;

    const bw = recommendQueue({
      live,
      profiles: allProfiles,
      targetState: "focused",
      recentTrackIds: [],
      limit: 5,
    }).map((q) => ({
      ...q,
      predictedAlignment: alignmentScore(live, q.songProfile),
    }));

    const rnd = buildRandomShadowQueue({
      candidates: allProfiles.map((p) => ({ trackId: p.trackId, trackName: p.trackName })),
      limit: 5,
    }).map((q) => {
      const p = allProfiles.find((sp) => sp.trackId === q.trackId);
      return {
        ...q,
        songProfile: p,
        predictedAlignment: alignmentScore(live, p),
      };
    });

    setBrainwaveQueue(bw);
    setRandomQueue(rnd);
  }, [eeg.snapshot, allProfiles]);

  useEffect(() => {
    const live = eeg.snapshot;
    if (!activeSession || !live) return;
    setActiveSession((s) =>
      s
        ? {
            ...s,
            brainwaveQueue,
            randomQueue,
            eegTimeline: [...s.eegTimeline, live].slice(-2400),
          }
        : s,
    );
  }, [activeSession, eeg.snapshot, brainwaveQueue, randomQueue]);

  const computedSummary = useMemo(() => {
    const s = activeSession;
    if (!s || s.eegTimeline.length < 2) return null;

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const bwAvg = avg(brainwaveQueue.map((q) => q.predictedAlignment));
    const rndAvg = avg(randomQueue.map((q) => q.predictedAlignment));

    const dt = 0.5; // mock EEG interval (s)
    const timeInTarget = s.eegTimeline.reduce(
      (acc, snap) => {
        if (snap.dominantState === s.targetState) {
          acc.brainwave += dt;
          acc.random += dt * 0.65;
        }
        return acc;
      },
      { brainwave: 0, random: 0 },
    );

    const winner =
      Math.abs(bwAvg - rndAvg) < 0.03 ? "tie" : bwAvg > rndAvg ? "brainwave" : "random";
    const winnerReason =
      winner === "tie"
        ? "Alignment scores are effectively equal in this window."
        : winner === "brainwave"
          ? "BrainWave queue has higher alignment with your live EEG."
          : "Random shadow queue scored higher (usually means sparse song profiles).";

    return {
      avgAlignmentScore: { brainwave: bwAvg, random: rndAvg },
      timeInTargetState: timeInTarget,
      avgEngagement: { brainwave: 0, random: 0 },
      skipCount,
      winner,
      winnerReason,
    } as const;
  }, [activeSession, brainwaveQueue, randomQueue, skipCount]);

  return (
    <Page title="Compare Mode">
      <div className="card">
        <div className="row">
          {!eeg.isConnected ? (
            <button className="btn primary" onClick={eeg.connect}>
              Connect EEG Headset
            </button>
          ) : (
            <button className="btn" onClick={eeg.disconnect}>
              Disconnect EEG
            </button>
          )}

          {!activeSession ? (
            <button
              className="btn primary"
              onClick={() => {
                const now = Date.now();
                setSkipCount({ brainwave: 0, random: 0 });
                setActiveSession({
                  sessionId: crypto.randomUUID(),
                  startTime: now,
                  endTime: now,
                  targetState: "focused",
                  brainwaveQueue,
                  randomQueue,
                  eegTimeline: [],
                  summary: {
                    avgAlignmentScore: { brainwave: 0, random: 0 },
                    timeInTargetState: { brainwave: 0, random: 0 },
                    avgEngagement: { brainwave: 0, random: 0 },
                    skipCount: { brainwave: 0, random: 0 },
                    winner: "tie",
                    winnerReason: "Not enough data yet.",
                  },
                });
              }}
            >
              Start session
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => {
                setActiveSession((s) =>
                  s
                    ? {
                        ...s,
                        endTime: Date.now(),
                        summary: computedSummary ?? s.summary,
                      }
                    : s,
                );
              }}
            >
              Stop session
            </button>
          )}

          <button
            className="btn"
            onClick={() => setSkipCount((c) => ({ ...c, brainwave: c.brainwave + 1 }))}
            disabled={!activeSession}
          >
            Jaw clench skip (BrainWave)
          </button>

          <button
            className={mode === "random" ? "btn primary" : "btn"}
            onClick={() => setMode("random")}
          >
            🎲 Random
          </button>
          <button
            className={mode === "brainwave" ? "btn primary" : "btn"}
            onClick={() => setMode("brainwave")}
          >
            🧠 BrainWave
          </button>
          <button
            className={mode === "compare" ? "btn primary" : "btn"}
            onClick={() => setMode("compare")}
          >
            ⚖️ Compare
          </button>
        </div>

        {allProfiles.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            No song profiles yet. Go to Dashboard, connect your EEG headset, and play a track to start
            building profiles.
          </p>
        ) : mode === "compare" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div className="card">
              <div className="cardTitle">BrainWave</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {brainwaveQueue.map((q) => (
                  <li key={q.trackId} style={{ margin: "6px 0" }}>
                    <span style={{ fontWeight: 650 }}>{q.trackName}</span>{" "}
                    <span className="muted">
                      · {(q.predictedAlignment * 100).toFixed(0)}% · {q.matchBand}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <div className="cardTitle">Random (shadow)</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {randomQueue.map((q) => (
                  <li key={q.trackId} style={{ margin: "6px 0" }}>
                    <span style={{ fontWeight: 650 }}>{q.trackName}</span>{" "}
                    <span className="muted">· {(q.predictedAlignment * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="cardTitle">{mode === "random" ? "Random" : "BrainWave"} queue</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(mode === "random" ? randomQueue : brainwaveQueue).map((q) => (
                <li key={q.trackId} style={{ margin: "6px 0" }}>
                  <span style={{ fontWeight: 650 }}>{q.trackName}</span>{" "}
                  <span className="muted">
                    · {(q.predictedAlignment * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardTitle">Session summary</div>
        {computedSummary ? (
          <p className="muted" style={{ margin: 0 }}>
            Winner: {computedSummary.winner}. Avg alignment — BrainWave{" "}
            {(computedSummary.avgAlignmentScore.brainwave * 100).toFixed(0)}% vs Random{" "}
            {(computedSummary.avgAlignmentScore.random * 100).toFixed(0)}%.{" "}
            {computedSummary.winnerReason}
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Start a session and keep EEG connected to accumulate comparison metrics.
          </p>
        )}
      </div>
    </Page>
  );
}

