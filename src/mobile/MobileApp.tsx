import { canUseVault } from "@tgcloud/ui/core/vaultPermissions";
import { useVaultPermission } from "@tgcloud/ui/core/vaultPermissions";
import { openVaultMembers, VaultMembersGate } from "@tgcloud/ui/core/vaultManagement";
import { Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PresenceList } from "@tgcloud/ui/ui/Presence";
import { UpdateBanner } from "@tgcloud/ui/ui/Update";
import {
  ArrowLeft,
  Clock,
  Globe,
  ArrowDownUp,
  Copy,
  Download,
  FolderInput,
  FolderOpen,
  HardDrive,
  LogOut,
  MoreVertical,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { api, type Node } from "../core/api";
import type { Session } from "../App";
import { actions, refresh, refreshSoon, useFolder, usePath, useRecent, useSearch, useTrash, useUsage } from "../core/data";
import { formatSize, sortNodes } from "../core/format";
import { nav, useLayers, useNav, useRoute, type Dest } from "../core/nav";
import { notifyError, uploads, useSelection, useUploads, useView } from "../core/store";
import { EmptyState, ErrorState, SkeletonRows } from "@tgcloud/ui/ui/States";
import { isLive, useTransfers } from "@tgcloud/ui/core/transfers";
import { FileList } from "./FileList";
import { Sheet, SheetItem } from "@tgcloud/ui/ui/Sheet";
import { ActionsSheet, ConfirmSheet, DetailsSheet, downloadNodes, ImportSheet, MoveSheet, NameSheet, NewSheet, ReceiveSheet, SortSheet } from "./Sheets";
import { android, available as onAndroid } from "@tgcloud/ui/core/android";
import { TransferChip } from "@tgcloud/ui/mobile/TransferChip";
import { Snackbar } from "@tgcloud/ui/mobile/Snackbar";
import { OfflineBadge } from "@tgcloud/ui/ui/Offline";
import { SendToVault } from "@tgcloud/ui/ui/SendToVault";
import { TransfersView } from "@tgcloud/ui/ui/Transfers";
import { Viewer } from "../shared/Viewer";
import { LanguagePicker } from "@tgcloud/ui/ui/LanguagePicker";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";


export default function MobileApp({ session }: { session: Session }) {
  const route = useRoute();
  const layers = useLayers();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fabSmall, setFabSmall] = useState(false);
  const selecting = layers.some((l) => l.type === "selection");

  // The mobile selection lives while the "selection" layer is on the stack.
  useEffect(() => {
    if (!selecting) useSelection.getState().clear();
  }, [selecting]);

  useEffect(() => {
    useUploads.setState({ onDone: refreshSoon });
  }, []);

  // "Share → TGDrive" from another app (on open or with the app already open).
  useEffect(() => {
    if (!onAndroid) return;
    const take = () => {
      const items = android.takeShared();
      if (items.length) nav.open({ type: "receive", items });
    };
    take();
    window.addEventListener("tg-shared", take);
    return () => window.removeEventListener("tg-shared", take);
  }, []);

  const parent = route.dest === "files" ? route.folder : 0;
  const mayWrite = useVaultPermission("write");
  const showFab = mayWrite && !selecting && (route.dest === "files" || route.dest === "recent");

  return (
    <div className="flex h-full flex-col bg-canvas">
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) uploads.add(e.target.files, parent);
          e.target.value = "";
        }}
      />
      <AppBar />
      <Screen onScrollDir={(down) => setFabSmall(down)} />
      {showFab && (
        <button
          onClick={() => nav.open({ type: "new" })}
          className={`step fixed right-4 z-20 flex items-center justify-center gap-2 rounded-2xl bg-brand text-white transition-all duration-200 active:translate-y-0.5 active:shadow-none ${fabSmall ? "size-14" : "h-14 px-5"}`}
          style={{ bottom: "calc(var(--bottombar-height) + var(--inset-bottom) + 16px)" }}
          aria-label={t("new")}
        >
          <Plus size={24} />
          {!fabSmall && <span className="text-[15px] font-semibold">{t("new")}</span>}
        </button>
      )}
      <BottomBar />
      <Snackbar />
      <Layers fileInput={fileInput} parent={parent} session={session} />
    </div>
  );
}

// ---- App bar ---------------------------------------------------------------

function AppBar() {
  const route = useRoute();
  const layers = useLayers();
  const selected = useSelection((s) => s.ids);
  const { data: path = [] } = usePath(route.dest === "files" ? route.folder : 0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (e: Event) => setScrolled((e.target as HTMLElement).scrollTop > 4);
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  const bar = (children: ReactNode, tone = "bg-canvas") => (
    <header
      className={`relative z-10 flex shrink-0 items-center gap-1 px-1 pt-[var(--inset-top)] ${tone}`}
      style={{ minHeight: "calc(var(--appbar-height) + var(--inset-top))", boxShadow: scrolled ? "var(--shadow-sticky)" : undefined }}
    >
      {children}
    </header>
  );
  const icon = (label: string, node: ReactNode, onClick: () => void) => (
    <button onClick={onClick} className="grid size-12 shrink-0 place-items-center rounded-full text-fg active:bg-s3" aria-label={label}>
      {node}
    </button>
  );

  if (layers.some((l) => l.type === "selection")) {
    const ids = [...selected];
    const inTrash = route.dest === "trash";
    return bar(
      <>
        {icon(t("sel.cancel"), <X size={22} />, nav.close)}
        <p className="flex-1 text-[18px] font-semibold tabular">{ids.length}</p>
        {inTrash ? (
          canUseVault("write") && icon(ui("common.restore"), <RotateCcw size={22} />, () => nav.closeThen(() => actions.restore(ids)))
        ) : (
          <>
            {icon(ui("common.move"), <FolderInput size={22} />, () => nav.open({ type: "move", ids, mode: "move" }))}
            {icon(ui("common.copy"), <Copy size={22} />, () => nav.open({ type: "move", ids, mode: "copy" }))}
            {onAndroid && icon(ui("common.download"), <Download size={22} />, () => nav.closeThen(() => void downloadNodes(ids)))}
            {canUseVault("trash") && icon(t("act.trash"), <Trash2 size={22} />, () => nav.closeThen(() => actions.trash(ids)))}
          </>
        )}
        {icon(ui("common.more"), <MoreVertical size={22} />, () => nav.open({ type: "actions", ids }))}
      </>,
      "bg-s2",
    );
  }

  if (route.dest === "search") return bar(<SearchField />);

  if (route.dest === "files" && route.folder !== 0) {
    const here = path[path.length - 1];
    const parents = path.slice(0, -1).map((p) => p.name);
    return bar(
      <>
        {icon(ui("common.back"), <ArrowLeft size={22} />, nav.back)}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[18px] leading-6 font-semibold">{here?.name ?? "…"}</p>
          <p className="truncate text-[12px] text-fg-3">{[t("nav.myDrive"), ...parents].join(" / ")}</p>
        </div>
        <OfflineBadge touch />
        <TransferChip onOpen={() => nav.dest("transfers")} />
        {icon(t("act.view"), <SlidersHorizontal size={20} />, () => nav.open({ type: "sort" }))}
      </>,
    );
  }

  const titles: Record<Dest, string> = { files: t("nav.myDrive"), recent: t("nav.recent"), trash: ui("common.trash"), transfers: t("nav.transfers"), search: "" };
  return bar(
    <>
      <h1 className="flex-1 truncate pl-4 font-heading text-[22px] font-bold tracking-tight text-fg-title">{titles[route.dest]}</h1>
      <OfflineBadge touch />
        <TransferChip onOpen={() => nav.dest("transfers")} />
      {icon(ui("common.search"), <Search size={22} />, () => nav.search(""))}
      {route.dest === "trash" ? (
        canUseVault("trash") && icon(t("act.emptyTrash"), <Trash2 size={20} />, () => nav.open({ type: "confirm", action: "empty", ids: [] }))
      ) : route.dest === "files" ? (
        <>
          {icon(t("act.view"), <SlidersHorizontal size={20} />, () => nav.open({ type: "sort" }))}
          {icon(t("act.account"), <MoreVertical size={20} />, () => nav.open({ type: "details", id: -1 }))}
        </>
      ) : null}
    </>,
  );
}

function SearchField() {
  const route = useRoute();
  const [text, setText] = useState(route.query);
  useEffect(() => {
    const t = setTimeout(() => nav.search(text), 200);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <>
      <button onClick={nav.back} className="grid size-12 shrink-0 place-items-center rounded-full active:bg-s3" aria-label={ui("common.back")}>
        <ArrowLeft size={22} />
      </button>
      <div className="relative mr-3 min-w-0 flex-1">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("search.placeholder")}
          enterKeyHint="search"
          className="surface h-11 w-full rounded-xl border border-line bg-s3 pr-11 pl-10 text-[16px] text-fg outline-none placeholder:text-fg-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        {text && (
          <button onClick={() => setText("")} className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-fg-2 active:bg-s4" aria-label={t("search.clear")}>
            <X size={18} />
          </button>
        )}
      </div>
    </>
  );
}

// ---- Bottom bar ------------------------------------------------------------

const destinations = (): { dest: Dest; label: string; icon: typeof FolderOpen }[] => [
  { dest: "files", label: t("nav.files"), icon: FolderOpen },
  { dest: "recent", label: t("nav.recent"), icon: Clock },
  { dest: "transfers", label: t("nav.transfers"), icon: ArrowDownUp },
  { dest: "trash", label: ui("common.trash"), icon: Trash2 },
];

function BottomBar() {
  const route = useRoute();
  const active = useTransfers((s) => s.list.filter(isLive).length) + useUploads((s) => s.jobs.filter((j) => j.state === "queued" || j.state === "sending").length);
  const current = route.dest === "search" ? "files" : route.dest;
  return (
    <nav
      className="glint-top z-20 flex shrink-0 bg-s1 pb-[var(--inset-bottom)]"
      style={{ height: "calc(var(--bottombar-height) + var(--inset-bottom))" }}
    >
      {destinations().map(({ dest, label, icon: Icon }) => {
        const on = current === dest;
        return (
          <button key={dest} onClick={() => nav.dest(dest)} className="flex flex-1 flex-col items-center justify-center gap-1" aria-current={on ? "page" : undefined}>
            <span className={`relative grid h-8 w-16 place-items-center rounded-full transition-colors ${on ? "bg-brand-soft text-brand" : "text-fg-2"}`}>
              <Icon size={22} strokeWidth={on ? 2.25 : 2} />
              {dest === "transfers" && active > 0 && (
                <span className="absolute top-0 right-3 grid h-4 min-w-4 place-items-center rounded-full bg-info px-1 text-[10px] font-bold text-white tabular">{active}</span>
              )}
            </span>
            <span className={`text-[12px] font-semibold ${on ? "text-fg" : "text-fg-2"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---- Screens ----------------------------------------------------------------

function Screen({ onScrollDir }: { onScrollDir: (down: boolean) => void }) {
  const route = useRoute();
  const direction = useNav((s) => s.direction);
  const last = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<number | null>(null);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await api.syncNow();
      await refresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setRefreshing(false);
    }
  };

  const key = `${route.dest}:${route.folder}`;
  const transition = usePageTransition(key, route.dest, direction);
  return (
    <main
      ref={scroller}
      className="relative flex-1 overflow-y-auto overscroll-contain"
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        if (Math.abs(top - last.current) > 6) onScrollDir(top > last.current && top > 40);
        last.current = top;
      }}
      onTouchStart={(e) => {
        pullStart.current = e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchMove={(e) => {
        if (pullStart.current !== null) setPull(Math.max(0, Math.min(110, (e.touches[0].clientY - pullStart.current) * 0.5)));
      }}
      onTouchEnd={() => {
        if (pull > 70) doRefresh();
        pullStart.current = null;
        setPull(0);
      }}
    >
      {(pull > 0 || refreshing) && (
        <div className="flex justify-center" style={{ height: refreshing ? 48 : pull, transition: pullStart.current ? "none" : "height 200ms var(--ease)" }}>
          <RotateCcw size={20} className={`mt-3 text-brand ${refreshing ? "animate-spin" : ""}`} style={{ transform: `rotate(${pull * 3}deg)`, opacity: refreshing ? 1 : pull / 70 }} />
        </div>
      )}
      <div key={key} className={transition}>
        {route.dest === "files" && route.folder === 0 && (
          <div className="mx-3 mb-2 empty:hidden">
            <UpdateBanner touch />
          </div>
        )}
        {route.dest === "files" && <FolderScreen id={route.folder} />}
        {route.dest === "recent" && <RecentScreen />}
        {route.dest === "trash" && <TrashScreen />}
        {route.dest === "transfers" && <TransfersView touch />}
        {route.dest === "search" && <SearchScreen text={route.query} />}
      </div>
      <div style={{ height: 96 }} />
    </main>
  );
}

/**
 * Page animation, decided only when the page changes (opening a sheet pushes
 * history but does not change the page, so nothing is animated):
 * switching tab = fade through; entering/leaving a folder = axis slide.
 */
function usePageTransition(key: string, dest: Dest, direction: 1 | -1) {
  const last = useRef<{ key: string; dest: Dest; cls: string } | null>(null);
  if (last.current?.key !== key) {
    const prev = last.current;
    const cls = !prev ? "" : prev.dest !== dest ? "anim-through" : direction === 1 ? "anim-forward" : "anim-back";
    last.current = { key, dest, cls };
  }
  return last.current.cls;
}

function openNode(n: Node, list: Node[]) {
  if (n.is_dir) nav.openFolder(n.id);
  else nav.open({ type: "viewer", id: n.id, siblings: list.filter((x) => !x.is_dir).map((x) => x.id) });
}

function Listing({ q, empty }: { q: { data?: Node[]; isLoading: boolean; error: unknown; refetch: () => void }; empty: ReactNode }) {
  const view = useView();
  if (q.isLoading) return <SkeletonRows rows={6} height={64} touch />;
  if (q.error) return <ErrorState touch error={q.error} retry={q.refetch} />;
  const list = sortNodes(q.data ?? [], view.sort, view.asc);
  if (!list.length) return <>{empty}</>;
  return <FileList nodes={list} onOpen={(n) => openNode(n, list)} />;
}

function FolderScreen({ id }: { id: number }) {
  const q = useFolder(id);
  return (
    <Listing
      q={q}
      empty={
        <EmptyState
          touch
          icon={FolderOpen}
          title={id === 0 ? t("empty.drive") : t("empty.folder")}
          text={t("empty.touchHint")}
        />
      }
    />
  );
}

function RecentScreen() {
  const q = useRecent();
  const view = useView();
  if (q.isLoading) return <SkeletonRows rows={6} height={64} touch />;
  if (q.error) return <ErrorState touch error={q.error} retry={q.refetch} />;
  const list = q.data ?? [];
  if (!list.length) return <EmptyState touch icon={Clock} title={t("empty.recent")} text={t("empty.recentText")} />;
  // Recent keeps the date order; the view (list/grid) applies the same way.
  void view;
  return <FileList nodes={list} onOpen={(n) => openNode(n, list)} />;
}

function TrashScreen() {
  const q = useTrash();
  return (
    <>
      {!!q.data?.length && (
        <p className="mx-4 mb-1 rounded-lg bg-s1 px-3 py-2.5 text-[13px] text-fg-2 surface">
          {t("trash.note")}
        </p>
      )}
      <Listing q={q} empty={<EmptyState touch icon={Trash2} title={t("empty.trash")} text={t("empty.trashText")} />} />
    </>
  );
}

function SearchScreen({ text }: { text: string }) {
  const q = useSearch(text);
  if (!text.trim()) return <EmptyState touch sync={false} icon={Search} title={t("search.title")} text={t("search.hint")} />;
  return <Listing q={{ ...q, isLoading: q.isLoading && q.fetchStatus !== "idle" }} empty={<EmptyState touch icon={Search} title={t("search.none")} text={t("search.noneText", { text })} />} />;
}

// ---- Layers -----------------------------------------------------------------

function Layers({ fileInput, parent, session }: { fileInput: React.RefObject<HTMLInputElement | null>; parent: number; session: Session }) {
  const layers = useLayers();
  // Each layer leaves with an animation (sheet slides down, dialog fades) before unmounting.
  const nodes = layers.map((l, i) => {
        const key = `${i}-${l.type}`;
        switch (l.type) {
          case "new":
            return <NewSheet key={key} fileInput={fileInput} parent={parent} />;
          case "actions":
            return <ActionsSheet key={key} ids={l.ids} />;
          case "name":
            return <NameSheet key={key} layer={l} />;
          case "move":
            return <MoveSheet key={key} layer={l} />;
          case "confirm":
            return <ConfirmSheet key={key} layer={l} onSignedOut={session.signOut} />;
          case "sort":
            return <SortSheet key={key} />;
          case "receive":
            return <ReceiveSheet key={key} layer={l} />;
          case "send-vault":
            return <SendToVault key={key} ids={l.ids} other={l.other} touch onClose={nav.close} />;
          case "language":
            return (
              <Sheet key={key} title={<p className="text-[16px] font-semibold">{ui("common.language")}</p>}>
                <LanguagePicker touch onChange={() => nav.close()} />
              </Sheet>
            );
          case "import":
            return <ImportSheet key={key} parent={l.parent} />;
          case "details":
            if (layers[i - 1]?.type === "viewer") return null;
            return l.id === -1 ? <AccountSheet key={key} session={session} /> : <DetailsSheet key={key} id={l.id} />;
          case "viewer":
            return <Viewer key={key} layer={l} touch />;
          default:
            return null;
        }
      });
  return (
    <PresenceList
      items={nodes.filter((n): n is React.ReactElement => !!n).map((n) => ({ key: String(n.key), node: n, instant: /viewer$/.test(String(n.key)) }))}
    />
  );
}

function AccountSheet({ session }: { session: Session }) {
  const { data: usage } = useUsage();
  return (
    <Sheet
      title={
        <div className="flex items-center gap-3">
          <div className="step grid size-10 place-items-center rounded-xl bg-brand text-white">
            <HardDrive size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{session.vault.name}</p>
            <p className="text-[12px] text-fg-3 tabular">
              {usage ? t("account.usage", { n: usage.files, size: formatSize(usage.bytes) }) : `… · ${t("account.unlimited")}`}
            </p>
          </div>
        </div>
      }
    >
      <VaultMembersGate><SheetItem icon={<Users />} onClick={() => nav.closeThen(openVaultMembers)}>
        {ui("members.title")}
      </SheetItem></VaultMembersGate>
      <SheetItem icon={<Repeat />} onClick={() => nav.closeThen(session.switchVault)}>
        {t("account.switch")}
      </SheetItem>
      <SheetItem
        icon={<RefreshCw />}
        onClick={() =>
          nav.closeThen(() =>
            api
              .syncNow()
              .then(() => refresh())
              .catch(notifyError),
          )
        }
      >
        {t("account.sync")}
      </SheetItem>
      <SheetItem icon={<Globe />} onClick={() => nav.replaceTop({ type: "language" })}>
        {ui("common.language")}
      </SheetItem>
      <SheetItem icon={<LogOut />} danger onClick={() => nav.replaceTop({ type: "confirm", action: "signout", ids: [] })}>
        {t("account.signOut")}
      </SheetItem>
    </Sheet>
  );
}
