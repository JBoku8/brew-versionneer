import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { applyTheme, readStoredTheme } from "./lib/theme";

// Apply the persisted theme before first paint to avoid a flash of the wrong theme.
applyTheme(readStoredTheme());

if ("__TAURI_INTERNALS__" in window) {
  void getCurrentWindow().show();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
