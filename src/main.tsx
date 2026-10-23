import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { configureApp } from "@tgcloud/ui/core/app";
import { installMock } from "@tgcloud/ui/core/server";
import { HardDrive } from "lucide-react";
import App from "./App";
import "./index.css";

configureApp({ id: "tgdrive", name: "TGDrive", icon: HardDrive, content: "files", downloads: "Download/TGDrive" });

/** Outside Tauri (only in `npm run dev`), the commands fall back to the simulated backend. */
if (!isTauri() && import.meta.env.DEV) installMock((await import("./core/mock")).mock);

// System insets coming from MainActivity (Android edge-to-edge): become
// --inset-* in CSS. Outside Android they stay in env(safe-area-inset-*).
type Insets = { top: number; right: number; bottom: number; left: number; ime: number };
const applyInsets = (i: Insets) => {
  const s = document.documentElement.style;
  s.setProperty("--inset-top", `${i.top}px`);
  s.setProperty("--inset-right", `${i.right}px`);
  s.setProperty("--inset-bottom", `${i.bottom}px`);
  s.setProperty("--inset-left", `${i.left}px`);
  s.setProperty("--inset-ime", `${i.ime}px`);
};
const bridge = (window as unknown as { TGInsets?: { get(): string } }).TGInsets;
if (bridge) applyInsets(JSON.parse(bridge.get()));
window.addEventListener("tg-insets", (e) => applyInsets((e as CustomEvent<Insets>).detail));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
