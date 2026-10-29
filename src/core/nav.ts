/**
 * TGDrive routes and layers over the shared Navigator (`@tgcloud/ui/core/nav`):
 * entering a folder, switching destination and opening a layer push; back closes
 * the top layer or returns to the previous folder.
 */
import { create } from "zustand";
import { createNav } from "@tgcloud/ui/core/nav";

export type Dest = "files" | "recent" | "trash" | "transfers" | "search";

export type Route = { dest: Dest; folder: number; query: string };

export type Layer =
  | { type: "new" }
  | { type: "actions"; ids: number[] }
  | { type: "name"; mode: "mkdir" | "rename"; id?: number; parent: number }
  | { type: "move"; ids: number[]; mode: "move" | "copy" }
  | { type: "viewer"; id: number; siblings: number[] }
  | { type: "confirm"; action: "purge" | "empty" | "signout"; ids: number[] }
  | { type: "selection" }
  | { type: "details"; id: number }
  /** Viewer ⋮ menu on mobile. */
  | { type: "viewer-menu" }
  | { type: "sort" }
  /** Language choice (account menu on mobile, vault menu on desktop). */
  | { type: "language" }
  | { type: "receive"; items: { uri: string; name: string; size: number; mime: string; path: string }[] }
  | { type: "import"; parent: number }
  /** Send (copy) to another vault. */
  | { type: "send-vault"; ids: number[]; other?: boolean };

const ROOT: Route = { dest: "files", folder: 0, query: "" };

function fromHash(hash: string): Route {
  const m = hash.match(/^#\/(files|recent|trash|transfers|search)(?:\/(\d+))?/);
  if (!m) return ROOT;
  return { dest: m[1] as Dest, folder: m[1] === "files" ? Number(m[2] ?? 0) : 0, query: "" };
}

const hashOf = (r: Route) => (r.dest === "files" ? `#/files/${r.folder}` : `#/${r.dest}`);

const sameRoute = (a: Route, b: Route) => a.dest === b.dest && a.folder === b.folder && a.query === b.query;

const core = createNav<Route, Layer>({ root: ROOT, parse: fromHash, hash: hashOf, same: sameRoute });

export const useNav = core.useNav;
export const useRoute = core.useRoute;
export const useLayers = core.useLayers;

/** Last visited folder, to go back to it when switching destination. */
const lastFolder = create(() => ({ folder: useNav.getState().entry.route.folder }));
useNav.subscribe((s) => {
  if (s.entry.route.dest === "files") lastFolder.setState({ folder: s.entry.route.folder });
});

export const nav = {
  ...core.nav,

  /** Goes to a route (without layers). A route equal to the current one does not push. */
  go(route: Partial<Route>) {
    core.nav.go({ ...ROOT, ...route });
  },

  openFolder(folder: number) {
    nav.go({ dest: "files", folder });
  },

  /** Destination switch in the bottom / side bar. */
  dest(dest: Dest) {
    if (dest === "files") nav.go({ dest, folder: lastFolder.getState().folder });
    else nav.go({ dest });
  },

  /** Search: replaces the entry when already searching (typing does not push). */
  search(query: string) {
    const cur = useNav.getState().entry;
    if (cur.route.dest === "search" && cur.layers.length === 0) core.nav.replace({ ...cur, route: { ...cur.route, query } });
    else core.nav.push({ route: { ...ROOT, dest: "search", query }, layers: [] });
  },
};
