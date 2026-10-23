import { useEffect, useRef } from "react";
import { UpdateBanner } from "@tgcloud/ui/ui/Update";
import { Clock, FolderOpen, Search, Trash2, Upload } from "lucide-react";
import type { Node } from "../core/api";
import type { Session } from "../App";
import { findNode, refreshSoon, useFolder, useRecent, useSearch, useTrash } from "../core/data";
import { nav, useLayers, useRoute } from "../core/nav";
import { uploads, useSelection, useUploads } from "../core/store";
import { isTauri } from "@tauri-apps/api/core";
import { EmptyState, ErrorState, SkeletonRows } from "@tgcloud/ui/ui/States";
import { ContextMenu, closeMenu, useMenu } from "@tgcloud/ui/desktop/Menu";
import { FileView } from "./FileTable";
import { DeskLayers, DetailsPanel } from "./Layers";
import { Sidebar } from "./Sidebar";
import { Toasts } from "@tgcloud/ui/desktop/Toasts";
import { TransfersView } from "@tgcloud/ui/ui/Transfers";
import { transfers } from "@tgcloud/ui/core/transfers";
import { Toolbar, TopBar } from "./TopBar";
import { useDrop } from "./dnd";
import { cmd, targetFolder, useDesk } from "./state";
import { Button } from "@tgcloud/ui/desktop/ui";
import { t } from "../i18n";

export default function DesktopApp({ session }: { session: Session }) {
  const route = useRoute();
  const fileInput = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const details = useDesk((s) => s.details);
  const selected = useSelection((s) => s.ids);
  const detailNode = selected.size === 1 ? findNode([...selected][0]) : undefined;

  useEffect(() => {
    useDesk.setState({
      // In the app, the native picker (Rust reads from disk); in the browser (dev mode), the page one.
      pickFiles: () => (isTauri() ? void pickNative(false) : fileInput.current?.click()),
      pickFolder: () => isTauri() && void pickNative(true),
    });
    useUploads.setState({ onDone: refreshSoon });
  }, []);

  // Switching folder/destination clears the selection.
  useEffect(() => {
    useSelection.getState().clear();
    useSelection.getState().setCursor(null);
  }, [route.dest, route.folder]);

  useShortcuts(searchRef);
  useOsDrop();

  return (
    <div className="desk flex h-full bg-canvas">
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) uploads.add(e.target.files, targetFolder());
          e.target.value = "";
        }}
      />
      <Sidebar session={session} onSignOut={() => nav.open({ type: "confirm", action: "signout", ids: [] })} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar searchRef={searchRef} />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <Toolbar />
            <Content />
          </div>
          {details && <DetailsPanel node={detailNode} />}
        </div>
      </div>
      <ContextMenu />
      <DeskLayers onSignedOut={session.signOut} />
      <Toasts onOpenTransfers={() => nav.dest("transfers")} />
    </div>
  );
}

function Content() {
  const route = useRoute();
  const { over, handlers } = useDrop(route.dest === "files" ? route.folder : null);
  return (
    <main {...handlers} className={`relative min-w-0 flex-1 overflow-y-auto px-4 ${over ? "bg-brand-soft/40" : ""}`}>
      {route.dest === "files" && route.folder === 0 && (
        <div className="px-6 pt-3 empty:hidden">
          <UpdateBanner touch={false} />
        </div>
      )}
      {route.dest === "files" && <FolderPane id={route.folder} />}
      {route.dest === "recent" && <RecentPane />}
      {route.dest === "trash" && <TrashPane />}
      {route.dest === "search" && <SearchPane text={route.query} />}
      {route.dest === "transfers" && <TransfersView touch={false} />}
      {over && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-2xl border-2 border-dashed border-brand text-[14px] font-semibold text-fg">
          {t("drop")}
        </div>
      )}
    </main>
  );
}

type Q = { data?: Node[]; isLoading: boolean; error: unknown; refetch: () => void };

function Pane({ q, empty, sortable = true }: { q: Q; empty: React.ReactNode; sortable?: boolean }) {
  if (q.isLoading) return <SkeletonRows rows={10} height={36} />;
  if (q.error) return <ErrorState error={q.error} retry={q.refetch} />;
  if (!q.data?.length) return <>{empty}</>;
  return <FileView nodes={q.data} sortable={sortable} />;
}

function FolderPane({ id }: { id: number }) {
  return (
    <Pane
      q={useFolder(id)}
      empty={
        <EmptyState
          icon={FolderOpen}
          title={id === 0 ? t("empty.drive") : t("empty.folder")}
          text={t("empty.deskHint")}
          action={
            <Button variant="primary" onClick={() => useDesk.getState().pickFiles()}>
              <Upload /> {t("act.uploadFiles")}
            </Button>
          }
        />
      }
    />
  );
}

const RecentPane = () => (
  <Pane q={useRecent()} sortable={false} empty={<EmptyState icon={Clock} title={t("empty.recent")} text={t("empty.recentText")} />} />
);

const TrashPane = () => (
  <Pane q={useTrash()} empty={<EmptyState icon={Trash2} title={t("empty.trash")} text={t("empty.trashText")} />} />
);

function SearchPane({ text }: { text: string }) {
  const q = useSearch(text);
  return (
    <Pane
      q={{ ...q, isLoading: q.isLoading && q.fetchStatus !== "idle" }}
      empty={<EmptyState icon={Search} title={t("search.none")} text={t("search.noneText", { text })} />}
    />
  );
}

/** Shortcuts (DESIGN.md §5.4). An open layer or a focused field takes priority. */
function useShortcuts(searchRef: React.RefObject<HTMLInputElement | null>) {
  const layers = useLayers();
  const typeahead = useRef({ text: "", at: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Already handled by a layer (Quick Look, player, dialog).
      if (e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      // Back/forward always work (including mouse side buttons via popstate).
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        return e.key === "ArrowLeft" ? nav.back() : nav.forward();
      }
      if (useMenu.getState().at) return;
      if (layers.length) {
        if (e.key === "Escape" && !typing) nav.close();
        return;
      }
      if (typing) return;

      const sel = useSelection.getState();
      const visible = useDesk.getState().visible;
      const route = nav.route();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if ((mod && k === "k") || e.key === "/") return run(() => searchRef.current?.focus());
      if (mod && e.shiftKey && k === "n") return run(cmd.newFolder);
      if (mod && k === "u") return run(() => useDesk.getState().pickFiles());
      if (mod && k === "a") return run(cmd.selectAll);
      if (mod && k === "c") return run(cmd.copy);
      if (mod && k === "x") return run(cmd.cut);
      if (mod && k === "v") return run(cmd.paste);
      if (mod && k === "i") return run(() => useDesk.setState((s) => ({ details: !s.details })));
      if (mod && k === "d") return run(cmd.download);
      if (e.key === "F2") return run(cmd.rename);
      if (e.key === "Delete") return run(cmd.trash);
      if (e.key === "Enter") return run(cmd.openSelection);
      if (e.key === " ") {
        const n = [...sel.ids].map((id) => findNode(id)).find((x) => x && !x.is_dir);
        if (n) return run(() => cmd.open(n));
        return;
      }
      if (e.key === "Escape") return run(() => sel.clear());
      if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) {
        if (route.dest === "files" && route.folder !== 0)
          return run(() => nav.openFolder(findNode(route.folder)?.parent_id ?? 0));
        return;
      }

      // Arrows, Home, End: move the cursor; Shift extends.
      const nav1 = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity } as Record<string, number>;
      if (e.key in nav1 && visible.length) {
        e.preventDefault();
        const cur = visible.findIndex((n) => n.id === (sel.cursor ?? -1));
        const step = nav1[e.key];
        const next = Math.max(0, Math.min(visible.length - 1, !isFinite(step) ? (step < 0 ? 0 : visible.length - 1) : cur < 0 ? 0 : cur + step));
        const id = visible[next].id;
        if (e.shiftKey && sel.anchor !== null) {
          const a = visible.findIndex((n) => n.id === sel.anchor);
          sel.set(visible.slice(Math.min(a, next), Math.max(a, next) + 1).map((n) => n.id));
        } else sel.set([id], id);
        sel.setCursor(id);
        return;
      }

      // Letter: jumps to the next item starting with what was typed.
      if (e.key.length === 1 && !mod && !e.altKey && /\S/.test(e.key) && visible.length) {
        const now = Date.now();
        const ta = typeahead.current;
        ta.text = now - ta.at < 700 ? ta.text + k : k;
        ta.at = now;
        const cur = visible.findIndex((n) => n.id === sel.cursor);
        const order = [...visible.slice(cur + (ta.text.length === 1 ? 1 : 0)), ...visible.slice(0, cur + 1)];
        const hit = order.find((n) => n.name.toLowerCase().startsWith(ta.text));
        if (hit) {
          sel.set([hit.id], hit.id);
          sel.setCursor(hit.id);
        }
      }
    };
    // Mouse side buttons (back/forward).
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) nav.back();
      if (e.button === 4) nav.forward();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, [layers, searchRef]);

  useEffect(() => closeMenu, []);
}

async function pickNative(directory: boolean) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: !directory, directory, title: directory ? t("act.uploadFolder") : t("act.uploadFiles") });
  if (!picked) return;
  const paths = Array.isArray(picked) ? picked : [picked];
  void transfers.uploadPaths(paths, targetFolder());
}

/**
 * Drags files and folders from the system (Tauri native event, which delivers the
 * paths). The target is the folder under the pointer (`data-drop-folder`); outside
 * a folder, the open folder.
 */
function useOsDrop() {
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
