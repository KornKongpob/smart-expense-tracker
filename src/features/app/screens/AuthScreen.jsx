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
      <section className="ui-card-strong finance-auth-panel finance-auth-panel-single">
        <div className="finance-auth-brand">Smart Expense</div>
        <h1 className="finance-auth-title">{mode === "signup" ? "สมัคร" : "เข้าใช้"}</h1>

        <div className="view-segmented finance-auth-switch">
          <button
            type="button"
            className={["view-segmented-btn", mode === "signin" ? "is-active" : ""].join(" ")}
            onClick={() => setMode("signin")}
            data-testid="sign-in-tab"
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            className={["view-segmented-btn", mode === "signup" ? "is-active" : ""].join(" ")}
            onClick={() => setMode("signup")}
            data-testid="sign-up-tab"
          >
            สมัคร
          </button>
        </div>

        {!hasSupabaseConfig ? (
          <div className="ui-toast ui-toast--error">
            <div className="finance-toast-copy">ยังไม่ได้ตั้งค่า Supabase สำหรับฝั่งเว็บ</div>
          </div>
        ) : null}

        <form className="finance-form" onSubmit={submit}>
          {mode === "signup" ? (
            <label className="finance-field">
              <span className="ui-label">ชื่อที่แสดง</span>
              <input
                className="ui-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="ชื่อของคุณ"
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="finance-field">
            <span className="ui-label">อีเมล</span>
            <input
              className="ui-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              data-testid="login-email"
            />
          </label>

          <label className="finance-field">
            <span className="ui-label">รหัสผ่าน</span>
              <input
                className="ui-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="อย่างน้อย 6 ตัว"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
                data-testid="login-password"
              />
          </label>

          {error ? <div className="ui-error">{error}</div> : null}

          <button type="submit" className="ui-btn ui-btn-primary finance-submit" disabled={!hasSupabaseConfig || saving} data-testid="login-submit">
            {saving ? "กำลังดำเนินการ..." : mode === "signup" ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
          </button>

          <div className="finance-auth-divider" aria-hidden="true">
            หรือ
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-secondary finance-submit"
            disabled={!hasSupabaseConfig || saving}
            onClick={continueAsGuest}
            data-testid="guest-login"
          >
            {saving ? "กำลังดำเนินการ..." : "ใช้แบบ Guest"}
          </button>
        </form>
      </section>
    </main>
  );
}
