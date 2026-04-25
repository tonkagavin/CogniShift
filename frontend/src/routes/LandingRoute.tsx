import { Link } from "react-router-dom";
import { Page } from "./_layout";

export function LandingRoute() {
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
          <Link className="btn" to="/signup">
            Create account
          </Link>
        </div>
      </div>
    </Page>
  );
}

