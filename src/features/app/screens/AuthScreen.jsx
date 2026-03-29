import { useState } from "react";

import { useExpenseApp } from "../AppProvider.jsx";

export default function AuthScreen() {
  const { hasSupabaseConfig, signIn, signInAnonymously, signUp, saving } = useExpenseApp();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      if (mode === "signup") {
        await signUp({ email, password, displayName });
      } else {
        await signIn({ email, password });
      }
    } catch (nextError) {
      setError(String(nextError?.message || nextError || "Authentication failed"));
    }
  };

  const continueAsGuest = async () => {
    setError("");

    try {
      await signInAnonymously();
    } catch (nextError) {
      setError(String(nextError?.message || nextError || "Authentication failed"));
    }
  };

  return (
    <main className="finance-auth">
      <section className="finance-auth-hero">
        <div className="finance-auth-brand">Smart Expense</div>
        <h1 className="finance-auth-title">Money, without the clutter.</h1>
        <p className="finance-auth-copy">Sign in with email, or start with guest mode first.</p>
      </section>

      <section className="ui-card-strong finance-auth-panel">
        <div className="view-segmented">
          <button
            type="button"
            className={["view-segmented-btn", mode === "signin" ? "is-active" : ""].join(" ")}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={["view-segmented-btn", mode === "signup" ? "is-active" : ""].join(" ")}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>

        {!hasSupabaseConfig ? (
          <div className="ui-toast ui-toast--error">
            <div className="finance-toast-copy">
              Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`. Add the browser env vars before using the redesigned app.
            </div>
          </div>
        ) : null}

        <form className="finance-form" onSubmit={submit}>
          {mode === "signup" ? (
            <label className="finance-field">
              <span className="ui-label">Display name</span>
              <input
                className="ui-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Teera"
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="finance-field">
            <span className="ui-label">Email</span>
            <input
              className="ui-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="finance-field">
            <span className="ui-label">Password</span>
            <input
              className="ui-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </label>

          {error ? <div className="ui-error">{error}</div> : null}

          <button type="submit" className="ui-btn ui-btn-primary finance-submit" disabled={!hasSupabaseConfig || saving}>
            {saving ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          <div className="finance-auth-divider" aria-hidden="true">
            or
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-secondary finance-submit"
            disabled={!hasSupabaseConfig || saving}
            onClick={continueAsGuest}
            data-testid="guest-login"
          >
            {saving ? "Please wait..." : "Continue as guest"}
          </button>

          <p className="finance-auth-copy finance-auth-alt-copy">Guest mode creates an anonymous Supabase session.</p>
        </form>

        <p className="finance-auth-footnote">Personal workspace, one owner, one monthly target.</p>
      </section>
    </main>
  );
}
