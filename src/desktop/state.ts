import { canUseVault } from "@tgcloud/ui/core/vaultPermissions";
import { canTrash } from "@tgcloud/ui/core/vault";
/** State and commands of the desktop shell (selection, clipboard, menus). */
import { createElement as h } from "react";
import { create } from "zustand";
import { ClipboardPaste, Copy, Download, Eye, FolderInput, FolderOpen, FolderPlus, FolderUp, Info, Pencil, RotateCcw, Save, Scissors, Send, Trash2, Upload } from "lucide-react";
import type { Node } from "../core/api";
import { actions, findNode } from "../core/data";
import { nav } from "../core/nav";
import { useClipboard, useSelection } from "../core/store";
import { transfers } from "@tgcloud/ui/core/transfers";
import type { MenuEntry } from "@tgcloud/ui/desktop/Menu";
import { t } from "../i18n";
import { t as tc } from "@tgcloud/ui/i18n/ui";
import { t as ui } from "@tgcloud/ui/i18n/ui";


type Desk = {
  /** Items in the order they appear (for Shift, arrows and Ctrl+A). */
  visible: Node[];
  details: boolean;
  renaming: number | null;
  /** Ids being dragged inside the app. */
  dragging: number[];
  pickFiles: () => void;
  pickFolder: () => void;
  /** Folder under the pointer during a system file drag. */
  osDrop: number | null;
};

export const useDesk = create<Desk>(() => ({
  visible: [],
  details: false,
  renaming: null,
  dragging: [],
  pickFiles: () => {},
  pickFolder: () => {},
  osDrop: null,
}));

export const selectedNodes = () =>
  [...useSelection.getState().ids].map((id) => findNode(id)).filter((n): n is Node => !!n);

/** Folder where "New", paste and upload land. */
export const targetFolder = () => {
  const r = nav.route();
  return r.dest === "files" ? r.folder : 0;
};

export const cmd = {
  open(n: Node) {
    if (n.is_dir) nav.openFolder(n.id);
    else {
      const files = useDesk.getState().visible.filter((x) => !x.is_dir).map((x) => x.id);
      nav.open({ type: "viewer", id: n.id, siblings: files.includes(n.id) ? files : [n.id] });
    }
  },
  openSelection() {
    const sel = selectedNodes();
    if (sel.length === 1) cmd.open(sel[0]);
  },
  rename() {
    if (!canUseVault("write")) return;
    const sel = selectedNodes();
    if (sel.length === 1) useDesk.setState({ renaming: sel[0].id });
  },
  newFolder() {
    if (!canUseVault("write")) return;
    nav.open({ type: "name", mode: "mkdir", parent: targetFolder() });
  },
  trash() {
    if (!canUseVault("trash")) return;
    const ids = [...useSelection.getState().ids];
    if (!ids.length) return;
    if (nav.route().dest === "trash") nav.open({ type: "confirm", action: "purge", ids });
    else actions.trash(ids);
  },
  restore() {
    if (!canUseVault("write")) return;
    const ids = [...useSelection.getState().ids];
    if (ids.length) actions.restore(ids);
  },
  move(mode: "move" | "copy") {
    if (!canUseVault("write")) return;
    const ids = [...useSelection.getState().ids];
    if (ids.length) nav.open({ type: "move", ids, mode });
  },
  copy() {
    const ids = [...useSelection.getState().ids];
    if (ids.length) useClipboard.setState({ ids, mode: "copy" });
  },
  cut() {
    if (!canUseVault("write")) return;
    const ids = [...useSelection.getState().ids];
    if (ids.length) useClipboard.setState({ ids, mode: "move" });
  },
  async paste() {
    if (!canUseVault("write")) return;
    const { ids, mode } = useClipboard.getState();
    if (!ids.length || !mode || nav.route().dest !== "files") return;
    const parent = targetFolder();
    const name = parent ? (findNode(parent)?.name ?? t("nav.folderFallback")) : t("nav.myDrive");
    if (mode === "move") {
      await actions.move(ids, parent, name);
      useClipboard.setState({ ids: [], mode: null });
    } else await actions.copy(ids, parent, name);
  },
  selectAll() {
    useSelection.getState().set(useDesk.getState().visible.map((n) => n.id));
  },
  /** Downloads the selection to the Downloads folder (folders recreate the tree). */
  download() {
    const ids = [...useSelection.getState().ids];
    if (ids.length) transfers.download(ids, () => nav.dest("transfers"));
  },
  saveAs() {
    const sel = selectedNodes();
    if (sel.length === 1 && !sel[0].is_dir) actions.saveAs(sel[0]);
  },
};

/** Menu of an item (or of the selection, if the item is part of it). */
export function itemMenu(): MenuEntry[] {
  const sel = selectedNodes();
  const one = sel.length === 1 ? sel[0] : null;
  if (nav.route().dest === "trash")
    return [
      { label: ui("common.restore"), icon: h(RotateCcw), run: cmd.restore },
      "sep",
      ...(canTrash() ? [{ capability: "trash" as const, label: t("act.purge"), icon: h(Trash2), danger: true, shortcut: "Delete", run: cmd.trash }] : []),
    ];
  return [
    ...(one
      ? ([
          { label: ui("common.open"), icon: h(one.is_dir ? FolderOpen : Eye), shortcut: "Enter", run: () => cmd.open(one) },
          { label: ui("common.download"), icon: h(Download), shortcut: "Mod+D", run: cmd.download },
          ...(one.is_dir ? [] : [{ label: t("act.saveAs"), icon: h(Save), run: cmd.saveAs }]),
          "sep",
          { capability: "write" as const, label: ui("common.rename"), icon: h(Pencil), shortcut: "F2", run: cmd.rename },
        ] as MenuEntry[])
      : sel.length > 1
        ? ([{ label: t("act.downloadN", { n: sel.length }), icon: h(Download), shortcut: "Mod+D", run: cmd.download }, "sep"] as MenuEntry[])
        : []),
    { capability: "write" as const, label: t("act.cut"), icon: h(Scissors), shortcut: "Mod+X", run: cmd.cut },
    { label: ui("common.copy"), icon: h(Copy), shortcut: "Mod+C", run: cmd.copy },
    { capability: "write" as const, label: t("act.moveTo"), icon: h(FolderInput), run: () => cmd.move("move") },
    { capability: "write" as const, label: t("act.copyTo"), icon: h(Copy), run: () => cmd.move("copy") },
    { label: t("act.sendVaultMenu"), icon: h(Send), run: () => nav.open({ type: "send-vault", ids: sel.map((n) => n.id) }) },
    { label: tc("cross.title", { app: "TGPhotos" }), icon: h(Send), run: () => nav.open({ type: "send-vault", other: true, ids: sel.map((n) => n.id) }) },
    "sep",
    ...(one ? ([{ label: t("act.details"), icon: h(Info), shortcut: "Mod+I", run: () => useDesk.setState({ details: true }) }] as MenuEntry[]) : []),
    ...(canTrash() ? [{ capability: "trash" as const, label: t("act.trash"), icon: h(Trash2), danger: true, shortcut: "Delete", run: cmd.trash }] : []),
  ];
}

/** Menu of the folder empty space. */
export function backgroundMenu(): MenuEntry[] {
  const dest = nav.route().dest;
  if (dest !== "files") return [];
  const clip = useClipboard.getState();
  return [
    { capability: "write" as const, label: ui("common.newFolder"), icon: h(FolderPlus), shortcut: "Mod+Shift+N", run: cmd.newFolder },
    { capability: "write" as const, label: t("act.uploadFilesMenu"), icon: h(Upload), shortcut: "Mod+U", run: () => useDesk.getState().pickFiles() },
    { capability: "write" as const, label: t("act.uploadFolderMenu"), icon: h(FolderUp), run: () => useDesk.getState().pickFolder() },
    "sep",
    {
      capability: "write",
      label: clip.ids.length ? t("act.pasteN", { n: clip.ids.length }) : t("act.paste"),
      icon: h(ClipboardPaste),
      shortcut: "Mod+V",
      disabled: !clip.ids.length,
      run: cmd.paste,
    },
    { label: ui("common.selectAll"), shortcut: "Mod+A", run: cmd.selectAll },
  ];
}
