import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import App from "./app/App.jsx";
import { AppStoreProvider } from "./store/store.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </StrictMode>
);
