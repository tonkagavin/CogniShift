import { Link } from "react-router-dom";
import { Page } from "./_layout";

export function LandingRoute() {
  return (
    <Page title="Landing / Onboarding">
      <div className="card">
        <p className="muted">
          Music-induced focus via EEG + AI. Start from Dashboard or run onboarding to configure your profile.
        </p>
        <div className="row">
          <Link className="btn primary" to="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </div>
    </Page>
  );
}

