"use client";

// A global error replaces the root layout, so the app stylesheet is not loaded
// here. Styles stay inline on purpose.
const pageStyle = {
  minHeight: "100dvh",
  margin: 0,
  display: "grid",
  placeItems: "center",
  padding: "1.25rem",
  background: "#f5f7fb",
  color: "#0f172a",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const cardStyle = {
  width: "min(28rem, 100%)",
  background: "#ffffff",
  borderRadius: "1rem",
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const buttonStyle = {
  appearance: "none",
  border: "none",
  borderRadius: "0.75rem",
  padding: "0.7rem 1rem",
  background: "#0f172a",
  color: "#ffffff",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
};

export default function GlobalError({ error, reset }) {
  return (
    <html lang="th">
      <body style={pageStyle}>
        <main style={cardStyle} role="alert">
          <div style={{ fontSize: "0.75rem", letterSpacing: "0.08em", color: "#64748b" }}>
            SMART EXPENSE
          </div>
          <h1 style={{ margin: 0, fontSize: "1.15rem" }}>แอปขัดข้อง</h1>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#475569" }}>
            ข้อมูลที่บันทึกไว้ยังอยู่ครบ ลองเปิดแอปใหม่อีกครั้ง
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8", wordBreak: "break-word" }}>
            {String(error?.message || "unknown_error")}
          </p>
          <button type="button" style={buttonStyle} onClick={() => reset()}>
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  );
}
