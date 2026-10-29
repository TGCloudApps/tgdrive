import { isTauri } from "@tauri-apps/api/core";
import { transfers } from "@tgcloud/ui/core/transfers";
import { useEffect } from "react";
import { useDesk } from "../desktop/state";

/**
 * Drags files and folders from the system (Tauri native event, which delivers the
 * paths). The target is the folder under the pointer (`data-drop-folder`); outside
 * a folder, the open folder.
 */
export function useOsDrop() {
  useEffect(() => {
    if (!isTauri()) return;
    const folderAt = (x: number, y: number) => {
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(x / dpr, y / dpr)?.closest<HTMLElement>("[data-drop-folder]");
      return el ? Number(el.dataset.dropFolder) : null;
    };
    // Registration is asynchronous: if cleanup runs first (StrictMode mounts
    // twice), unregister as soon as the promise resolves. Without this two
    // handlers would remain and each dropped file would be uploaded twice.
    let off: (() => void) | undefined;
    let disposed = false;
    import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
      const unlisten = await getCurrentWebview().onDragDropEvent(({ payload: p }) => {
        if (p.type === "enter" || p.type === "over") useDesk.setState({ osDrop: folderAt(p.position.x, p.position.y) });
        else if (p.type === "leave") useDesk.setState({ osDrop: null });
        else if (p.type === "drop") {
          const folder = folderAt(p.position.x, p.position.y);
          useDesk.setState({ osDrop: null });
          if (folder !== null && p.paths.length) void transfers.uploadPaths(p.paths, folder);
        }
      });
      if (disposed) unlisten();
      else off = unlisten;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
}
