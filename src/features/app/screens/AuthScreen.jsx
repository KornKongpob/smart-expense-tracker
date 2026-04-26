import { useState } from "react";

import { useExpenseApp } from "../AppProvider.jsx";

function toFriendlyAuthError(nextError) {
  const rawMessage = String(nextError?.message || nextError || "").trim();
  const message = rawMessage.toLowerCase();

  if (!message) return "ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง";
  if (message.includes("invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง ลองตรวจข้อมูลแล้วเข้าสู่ระบบอีกครั้ง";
  }
  if (message.includes("email not confirmed")) {
    return "อีเมลนี้ยังไม่ได้ยืนยันการสมัคร เปิดอีเมลยืนยันก่อนแล้วค่อยลองใหม่";
  }
  if (message.includes("user already registered")) {
    return "อีเมลนี้ถูกใช้งานแล้ว ลองเข้าสู่ระบบหรือใช้อีเมลอื่น";
  }
  if (message.includes("password")) {
    return "รหัสผ่านไม่ถูกต้องหรือสั้นเกินไป ควรมีอย่างน้อย 6 ตัว";
  }
  if (message.includes("anonymous") || message.includes("anon")) {
    return "ยังเข้าแบบ Guest ไม่ได้ ตรวจว่า Supabase เปิด Anonymous sign-ins และลองใหม่อีกครั้ง";
  }
  if (message.includes("supabase_browser_env_missing")) {
    return "ยังไม่ได้ตั้งค่า Supabase สำหรับฝั่งเว็บ";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "เชื่อมต่อบริการไม่ได้ ลองใหม่อีกครั้งเมื่ออินเทอร์เน็ตพร้อม";
  }
  return "ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง";
}

export default function AuthScreen() {
  const { authError, hasSupabaseConfig, signIn, signInAnonymously, signUp, saving } = useExpenseApp();
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
      setError(toFriendlyAuthError(nextError));
    }
  };

  const continueAsGuest = async () => {
    setError("");

    try {
      await signInAnonymously();
    } catch (nextError) {
      setError(toFriendlyAuthError(nextError));
    }
  };

  return (
    <main className="finance-auth">
      <section className="ui-card-strong finance-auth-panel finance-auth-panel-single">
        <div className="finance-auth-brand">Smart Expense</div>

        <div className="finance-auth-title-group">
          <h1 className="finance-auth-title">{mode === "signup" ? "สมัคร" : "เข้าใช้"}</h1>
          <p className="finance-auth-copy">
            {mode === "signup"
              ? "เริ่มจัดบัญชี รายจ่าย และงบประมาณของคุณในที่เดียว"
              : "ดูรายจ่าย งบประมาณ และภาพรวมการเงินในที่เดียว"}
          </p>
        </div>

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

        {hasSupabaseConfig && authError ? (
          <div className="ui-toast ui-toast--warning" role="status" aria-live="polite">
            <div className="finance-toast-copy">{toFriendlyAuthError(authError)}</div>
          </div>
        ) : null}

        <form className="finance-form" onSubmit={submit}>
          {mode === "signup" ? (
            <label className="finance-field">
              <span className="ui-label">ชื่อที่แสดง</span>
              <input
                className="ui-input"
                name="displayName"
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
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              data-testid="login-email"
            />
          </label>

          <label className="finance-field">
            <span className="ui-label">รหัสผ่าน</span>
            <input
              className="ui-input"
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="อย่างน้อย 6 ตัว"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              required
              data-testid="login-password"
            />
          </label>

          {error ? (
            <div className="ui-toast ui-toast--error finance-inline-note" role="alert" aria-live="polite">
              <div className="finance-toast-copy">{error}</div>
            </div>
          ) : null}

          <button
            type="submit"
            className="ui-btn ui-btn-primary finance-submit"
            disabled={!hasSupabaseConfig || saving}
            data-testid="login-submit"
          >
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
