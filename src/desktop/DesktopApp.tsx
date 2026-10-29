import { canUseVault } from "@tgcloud/ui/core/vaultPermissions";
import { isTauri } from "@tauri-apps/api/core";
import { ContextMenu,closeMenu,useMenu } from "@tgcloud/ui/desktop/Menu";
import { Toasts } from "@tgcloud/ui/desktop/Toasts";
import { useEffect,useRef } from "react";
import type { Session } from "../App";
import { findNode,refreshSoon } from "../core/data";
import { nav,useLayers,useRoute } from "../core/nav";
import { uploads,useSelection,useUploads } from "../core/store";
import { DriveContent } from "../shared/DriveContent";
import { pickNative } from "../shared/pickFiles";
import { useOsDrop } from "../shared/useFileDrop";
import { DeskLayers,DetailsPanel } from "./Layers";
import { Sidebar } from "./Sidebar";
import { Toolbar,TopBar } from "./TopBar";
import { cmd,targetFolder,useDesk } from "./state";

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
      pickFiles: () => canUseVault("write") && (isTauri() ? void pickNative(false) : fileInput.current?.click()),
      pickFolder: () => canUseVault("write") && isTauri() && void pickNative(true),
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
            <DriveContent />
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
