import { create } from "zustand";
import type { SortKey } from "./format";

// ---- View preferences (persisted per device) ----------------------------

type View = { layout: "list" | "grid"; sort: SortKey; asc: boolean };

function loadView(): View {
  try {
    return { layout: "list", sort: "name", asc: true, ...JSON.parse(localStorage.getItem("view") ?? "{}") };
  } catch {
    return { layout: "list", sort: "name", asc: true };
  }
}

export const useView = create<View & { set: (v: Partial<View>) => void }>((set, get) => ({
  ...loadView(),
  set: (v) => {
    set(v);
    try {
      const { layout, sort, asc } = get();
      localStorage.setItem("view", JSON.stringify({ layout, sort, asc }));
    } catch {
      /* no storage: stays in memory */
    }
  },
}));

// ---- Selection -------------------------------------------------------------

type Selection = {
  ids: Set<number>;
  /** Anchor for Shift+click / Shift+arrow. */
  anchor: number | null;
  /** Item with keyboard focus (desktop). */
  cursor: number | null;
  set: (ids: number[], anchor?: number | null) => void;
  toggle: (id: number) => void;
  clear: () => void;
  setCursor: (id: number | null) => void;
};

export const useSelection = create<Selection>((set) => ({
  ids: new Set(),
  anchor: null,
  cursor: null,
  set: (ids, anchor) => set((s) => ({ ids: new Set(ids), anchor: anchor === undefined ? s.anchor : anchor })),
  toggle: (id) =>
    set((s) => {
      const ids = new Set(s.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ids, anchor: id };
    }),
  clear: () => set({ ids: new Set(), anchor: null }),
  setCursor: (cursor) => set({ cursor }),
}));

// ---- Clipboard (desktop: Ctrl+C / Ctrl+X / Ctrl+V) -------------------------

export const useClipboard = create<{ ids: number[]; mode: "copy" | "move" | null }>(() => ({ ids: [], mode: null }));

export { dismiss, notify, notifyError, useNotices, type Notice } from "@tgcloud/ui/core/notices";
export { uploads, useUploads, type Job } from "@tgcloud/ui/core/uploads";
