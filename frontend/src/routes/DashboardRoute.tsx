import { Page } from "./_layout";
import { SdkPlayer } from "../components/SdkPlayer";
import { useEffect } from "react";
import { useSpotifyStore } from "../state/spotifyStore";
import { useEEG } from "../features/eeg/useEEG";
import { SongProfileRecorder } from "../features/profiling/SongProfileRecorder";
import { useMemo, useState } from "react";
import { useSongProfileStore } from "../state/songProfileStore";
import { recommendQueue, type QueueEntry } from "../features/queue/recommender";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { ingestSongProfileSession } from "../features/profiling/profileApi";
import { EEGVisualizer } from "../components/EEGVisualizer";

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
  const user = useSupabaseAuthStore((s) => s.user);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [eegHistory, setEegHistory] = useState<typeof eeg.snapshot[]>([]);

  useEffect(() => {
    void initPlayer().catch((e) => {
      // Surface via store when possible; this is a last resort.
      console.error(e);
    });
  }, [initPlayer]);

  useEffect(() => {
    if (!eeg.isConnected || !eeg.snapshot || eeg.estimatedMode) return;
    recorder.pushSnapshot(eeg.snapshot);
    setEegHistory((prev) => [...prev, eeg.snapshot].slice(-60));
  }, [eeg.isConnected, eeg.estimatedMode, eeg.snapshot, recorder]);

  useEffect(() => {
    const trackId = currentTrack?.trackId;
    if (!trackId) return;

    const previous = listProfiles().find((p) => p.trackId === trackId);
    recorder.start({
      trackId,
      trackName: currentTrack.trackName,
      artist: currentTrack.artist,
    });

    return () => {
      const built = recorder.stopAndBuildProfile(previous);
      if (!built) return;
      upsertProfile(built);
      if (!user?.id) return;
      void ingestSongProfileSession({
        userId: user.id,
        trackId: built.trackId,
        trackName: built.trackName,
        artist: built.artist,
        sessionSnapshots: built.eegSessions.at(-1)?.snapshots ?? [],
      }).catch((e) => {
        console.error("Song profile ingest failed", e);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.trackId, user?.id]);

  useEffect(() => {
    const run = () => {
      if (!eeg.snapshot) return;
      const profiles = listProfiles();
      if (profiles.length === 0) return;
      const nextQueue = recommendQueue({
        live: eeg.snapshot,
        profiles,
        targetState: eeg.snapshot.dominantState ?? "focused",
        recentTrackIds: currentTrack?.trackId ? [currentTrack.trackId] : [],
        limit: 5,
      });
      setQueue(nextQueue);
    };
    run();
    const id = window.setInterval(run, 30_000);
    return () => window.clearInterval(id);
  }, [eeg.snapshot, currentTrack?.trackId, listProfiles]);

  useEffect(() => {
    if (!eeg.gestureDetected) return;
    if (eeg.gestureDetected.type === "jawClench") {
      void next();
    } else if (eeg.gestureDetected.type === "longBlink") {
      void togglePlay();
    }
  }, [eeg.gestureDetected, next, togglePlay]);

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
          <div className="cardTitle">Live EEG</div>
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
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            {eeg.hardwareError ? (
              <>
                <span style={{ color: "#fca5a5" }}>EEG hardware: {eeg.hardwareError}</span>
              </>
            ) : eeg.snapshot ? (
              `γ ${eeg.snapshot.gamma.toFixed(2)} · β ${eeg.snapshot.beta.toFixed(2)} · α ${eeg.snapshot.alpha.toFixed(2)} · θ ${eeg.snapshot.theta.toFixed(2)} · state ${eeg.snapshot.dominantState}`
            ) : (
              "No signal yet"
            )}
            {eeg.gestureDetected ? ` · gesture ${eeg.gestureDetected.type}` : ""}
            {eeg.estimatedMode ? " · Estimated Mode" : ""}
          </p>
          {eeg.streamStatus && !eeg.hardwareError ? (
            <p className="muted" style={{ marginTop: 6 }}>
              {eeg.streamStatus}
            </p>
          ) : null}
          <EEGVisualizer snapshot={eeg.snapshot} history={eegHistory.filter(Boolean) as NonNullable<typeof eeg.snapshot>[]} />
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
                    {q.songProfile && q.songProfile.listenCount < 2 ? " · Low confidence" : " · Profiled"}
                    {eeg.estimatedMode ? " · Estimated" : ""}
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

