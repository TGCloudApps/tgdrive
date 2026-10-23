/**
 * Desktop drag and drop: app items (move to folder) and system
 * files (upload to the folder). Folder, breadcrumb and tree are targets.
 */
import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Node } from "../core/api";
import { actions, findNode } from "../core/data";
import { uploads, useSelection } from "../core/store";
import { useDesk } from "./state";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";

const MIME = "application/x-tgdrive-ids";

export function startDrag(e: React.DragEvent, node: Node) {
  const sel = useSelection.getState();
  // Dragging an item outside the selection drags only it (and selects it).
  const ids = sel.ids.has(node.id) ? [...sel.ids] : [node.id];
  if (!sel.ids.has(node.id)) sel.set([node.id], node.id);
  e.dataTransfer.setData(MIME, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = "copyMove";
  useDesk.setState({ dragging: ids });
  // Compact ghost: "3 items" instead of the whole row.
  const ghost = document.createElement("div");
  ghost.textContent = ids.length === 1 ? node.name : ui("common.items", { n: ids.length });
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-100px",
    padding: "6px 10px",
    borderRadius: "8px",
    background: "#7b41c9",
    color: "#fff",
    font: "600 13px Inter Variable, sans-serif",
  });
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, -12, -12);
  setTimeout(() => ghost.remove(), 0);
}

export const endDrag = () => useDesk.setState({ dragging: [] });

// In the app, system files arrive through the Tauri native event (DesktopApp);
// handling the HTML event too would upload everything twice. Only the browser
// (dev mode) uses the HTML path.
const hasFiles = (e: React.DragEvent) => !isTauri() && e.dataTransfer.types.includes("Files");
const hasItems = (e: React.DragEvent) => e.dataTransfer.types.includes(MIME);

/** Drop target for the `folder` folder (0 = root). */
export function useDrop(folder: number | null) {
  const [over, setOver] = useState(false);
  const osOver = useDesk((s) => folder !== null && s.osDrop === folder);
  const accepts = (e: React.DragEvent) => {
    if (folder === null) return false;
    if (hasFiles(e)) return true;
    if (!hasItems(e)) return false;
    // Does not drop a folder into itself.
    return !useDesk.getState().dragging.includes(folder);
  };
  return {
    over: over || osOver,
    handlers: {
      // Dragging system files is native (Tauri) and finds the target through here.
      "data-drop-folder": folder ?? undefined,
      onDragOver: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = hasFiles(e) ? "copy" : e.ctrlKey || e.altKey ? "copy" : "move";
        setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        if (!accepts(e) || folder === null) return;
        e.preventDefault();
        e.stopPropagation();
        if (hasFiles(e)) {
          uploads.add(e.dataTransfer.files, folder);
          return;
        }
        const ids: number[] = JSON.parse(e.dataTransfer.getData(MIME) || "[]");
        endDrag();
        const name = folder ? (findNode(folder)?.name ?? t("nav.folderFallback")) : t("nav.myDrive");
        if (e.ctrlKey || e.altKey) actions.copy(ids, folder, name);
        else actions.move(ids, folder, name);
      },
    },
  };
}
