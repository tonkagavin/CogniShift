import { Page } from "./_layout";
import { SdkPlayer } from "../components/SdkPlayer";
import { useEffect } from "react";
import { useSpotifyStore } from "../state/spotifyStore";
import { useEEG } from "../features/eeg/useEEG";
import { SongProfileRecorder } from "../features/profiling/SongProfileRecorder";
import { useMemo, useState } from "react";
import { useSongProfileStore } from "../state/songProfileStore";
import { recommendQueue, type QueueEntry } from "../features/queue/recommender";

export function DashboardRoute() {
  const {
    isAuthed,
    isConnected,
    isReady,
    lastError,
    currentTrack,
    isPaused,
    login,
    initPlayer,
    connectPlayer,
    togglePlay,
    next,
  } = useSpotifyStore();

  const eeg = useEEG();
  const recorder = useMemo(() => new SongProfileRecorder({ minListenMs: 30_000 }), []);
  const { upsertProfile, listProfiles } = useSongProfileStore();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [simStatus, setSimStatus] = useState<string | null>(null);

  useEffect(() => {
    void initPlayer().catch((e) => {
      // Surface via store when possible; this is a last resort.
      console.error(e);
    });
  }, [initPlayer]);

  useEffect(() => {
    if (!eeg.isConnected || !eeg.snapshot) return;
    recorder.pushSnapshot(eeg.snapshot);
  }, [eeg.isConnected, eeg.snapshot, recorder]);

  useEffect(() => {
    const trackId = currentTrack?.trackId;
    if (!trackId || !eeg.snapshot) return;

    // Very simple: when track changes, stop previous session and start new.
    // (We’ll later wire this to actual playback start/end + 2s sampling cadence.)
    const previous = listProfiles().find((p) => p.trackId === trackId);
    recorder.start({
      trackId,
      trackName: currentTrack.trackName,
      artist: currentTrack.artist,
    });

    return () => {
      const built = recorder.stopAndBuildProfile(previous);
      if (built) upsertProfile(built);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.trackId]);

  useEffect(() => {
    if (!eeg.snapshot) return;
    const profiles = listProfiles();
    if (profiles.length === 0) return;
    const nextQueue = recommendQueue({
      live: eeg.snapshot,
      profiles,
      targetState: "focus",
      recentTrackIds: currentTrack?.trackId ? [currentTrack.trackId] : [],
      limit: 5,
    });
    setQueue(nextQueue);
  }, [eeg.snapshot, currentTrack?.trackId, listProfiles]);

  return (
    <Page title="Dashboard">
      <div className="grid">
        <SdkPlayer
          isConnected={isConnected}
          deviceName="Spotify Web Playback SDK"
          trackName={currentTrack?.trackName ?? "Not playing"}
          artist={
            !isAuthed
              ? "Sign in to Spotify to enable playback"
              : currentTrack?.artist ?? "—"
          }
          onConnect={async () => {
            if (!isAuthed) {
              await login();
              return;
            }
            if (!isReady) {
              await initPlayer();
            }
            await connectPlayer();
          }}
          onTogglePlay={async () => {
            if (!isConnected) return;
            await togglePlay();
          }}
          onNext={async () => {
            if (!isConnected) return;
            await next();
          }}
        />

        <div className="card">
          <div className="cardTitle">Live EEG (placeholder)</div>
          <div className="row">
            {!eeg.isConnected ? (
              <button className="btn primary" onClick={eeg.connect}>
                Connect EEG (mock)
              </button>
            ) : (
              <button className="btn" onClick={eeg.disconnect}>
                Disconnect EEG
              </button>
            )}
            <button
              className="btn"
              onClick={async () => {
                const backend = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
                setSimStatus("Running backend simulation...");
                try {
                  const res = await fetch(`${backend}/simulations/mock-eeg/run`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ durationSec: 20 }),
                  });
                  const data = (await res.json()) as
                    | { status: string; picklePath: string; csvPath: string }
                    | { detail: string };
                  if (!res.ok) throw new Error("detail" in data ? data.detail : "Simulation failed");
                  setSimStatus(
                    `Simulation complete. Pickle: ${"picklePath" in data ? data.picklePath : "n/a"}`,
                  );
                } catch (e) {
                  setSimStatus(`Simulation error: ${e instanceof Error ? e.message : String(e)}`);
                }
              }}
            >
              Run mock simulation (.pickle)
            </button>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            {eeg.snapshot
              ? `γ ${eeg.snapshot.gamma.toFixed(2)} · β ${eeg.snapshot.beta.toFixed(2)} · α ${eeg.snapshot.alpha.toFixed(2)} · θ ${eeg.snapshot.theta.toFixed(2)} · state ${eeg.snapshot.dominantState}`
              : "No signal yet"}
            {eeg.gestureDetected ? ` · gesture ${eeg.gestureDetected.type}` : ""}
          </p>
          {simStatus ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {simStatus}
            </p>
          ) : null}
        </div>

        <div className="card">
          <div className="cardTitle">Predicted queue (placeholder)</div>
          {queue.length === 0 ? (
            <p className="muted">
              Listen to a track with EEG connected to generate song profiles, then the queue will
              populate.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {queue.map((q) => (
                <li key={q.trackId} style={{ margin: "6px 0" }}>
                  <span style={{ fontWeight: 650 }}>{q.trackName}</span>{" "}
                  <span className="muted">
                    · {(q.predictedAlignment * 100).toFixed(0)}% · {q.matchBand}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="cardTitle">Spotify status</div>
          <p className="muted">
            {lastError
              ? `Error: ${lastError}`
              : !isAuthed
                ? "Not signed in"
                : isConnected
                  ? `Connected${isPaused ? " (paused)" : ""}`
                  : isReady
                    ? "Ready to connect"
                    : "Initializing SDK…"}
          </p>
        </div>
      </div>
    </Page>
  );
}

