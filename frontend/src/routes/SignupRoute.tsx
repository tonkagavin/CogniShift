import { Page } from "./_layout";
import { useState } from "react";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";

export function SignupRoute() {
  const { user, loading, error, signUp, signIn, signOut, clearError } = useSupabaseAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Page title="Signup">
      <div className="card">
        <p className="muted">Supabase Auth (email/password)</p>
        <div className="row" style={{ marginTop: 10 }}>
          <input
            style={{ minWidth: 260, padding: 10, borderRadius: 10, border: "1px solid #333" }}
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => {
              clearError();
              setEmail(e.target.value);
            }}
          />
          <input
            style={{ minWidth: 220, padding: 10, borderRadius: 10, border: "1px solid #333" }}
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => {
              clearError();
              setPassword(e.target.value);
            }}
          />
        </div>
        <div className="row">
          <button className="btn primary" disabled={loading} onClick={() => void signUp(email, password)}>
            {loading ? "Working..." : "Create account"}
          </button>
          <button className="btn" disabled={loading} onClick={() => void signIn(email, password)}>
            Sign in
          </button>
          <button className="btn" disabled={loading || !user} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        {user ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Signed in as {user.email ?? user.id}
          </p>
        ) : null}
        {error ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Auth error: {error}
          </p>
        ) : null}
      </div>
    </Page>
  );
}

