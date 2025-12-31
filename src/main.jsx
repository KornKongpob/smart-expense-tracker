// src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import App from "./app/App.jsx";
import { AppStoreProvider } from "./store/store.jsx";

// ✅ Disable browser zoom (per product requirement)
(function preventZoom() {
  // iOS Safari pinch zoom
  const prevent = (e) => {
    try { e.preventDefault(); } catch {}
  };
  window.addEventListener("gesturestart", prevent, { passive: false });
  window.addEventListener("gesturechange", prevent, { passive: false });
  window.addEventListener("gestureend", prevent, { passive: false });

  // Ctrl/Cmd + wheel zoom
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Ctrl/Cmd +/-/0 zoom
  window.addEventListener(
    "keydown",
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = String(e.key || "");
      if (k === "+" || k === "=" || k === "-" || k === "_" || k === "0") {
        e.preventDefault();
      }
    },
    { passive: false }
  );
})();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </StrictMode>
);
