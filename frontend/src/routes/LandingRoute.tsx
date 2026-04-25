import { Link } from "react-router-dom";
import { Page } from "./_layout";
import { useSpotifyStore } from "../state/spotifyStore";

export function LandingRoute() {
  const loginSpotify = useSpotifyStore((s) => s.login);

  return (
    <Page title="Landing / Onboarding">
      <div className="card">
        <p className="muted">
          Music-induced focus via EEG + AI. Start by signing in with Spotify, then calibrate
          your baseline.
        </p>
        <div className="row">
          <Link className="btn primary" to="/dashboard">
            Go to dashboard
          </Link>
          <button className="btn" onClick={() => void loginSpotify()}>
            Connect Spotify
          </button>
        </div>
      </div>
    </Page>
  );
}

