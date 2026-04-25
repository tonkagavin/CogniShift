import * as React from "react";
import styles from "./SdkPlayer.module.css";
import { BrainSpotifyLogo } from "./BrainSpotifyLogo";

type SdkPlayerProps = {
  isConnected?: boolean;
  deviceName?: string;
  trackName?: string;
  artist?: string;
  onConnect?: () => void;
  onTogglePlay?: () => void;
  onNext?: () => void;
};

export function SdkPlayer({
  isConnected = false,
  deviceName = "Spotify Web SDK",
  trackName = "Not playing",
  artist = "—",
  onConnect,
  onTogglePlay,
  onNext,
}: SdkPlayerProps) {
  return (
    <section className={styles.root} aria-label="SDK Player">
      <header className={styles.header}>
        <div className={styles.brand}>
          <BrainSpotifyLogo size={30} title="CogniShift" />
          <div className={styles.brandText}>
            <div className={styles.title}>CogniShift</div>
            <div className={styles.subtitle}>{deviceName}</div>
          </div>
        </div>

        <div className={styles.statusPill} aria-live="polite">
          <span
            className={`${styles.dot} ${isConnected ? styles.dotConnected : ""}`}
            aria-hidden="true"
          />
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.track}>
          <div className={styles.trackName} title={trackName}>
            {trackName}
          </div>
          <div className={styles.artist} title={artist}>
            {artist}
          </div>
        </div>

        <div className={styles.buttons}>
          {!isConnected ? (
            <button className={`${styles.button} ${styles.primary}`} onClick={onConnect}>
              Connect
            </button>
          ) : (
            <>
              <button className={`${styles.button} ${styles.primary}`} onClick={onTogglePlay}>
                Play / Pause
              </button>
              <button className={styles.button} onClick={onNext}>
                Next
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

