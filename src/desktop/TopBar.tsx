import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  FolderInput,
  Info,
  LayoutGrid,
  List,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { usePath, useTrash } from "../core/data";
import { nav, useNav, useRoute } from "../core/nav";
import { useSelection, useView } from "../core/store";
import { useDrop } from "./dnd";
import { cmd, useDesk } from "./state";
import { Button, IconButton, Kbd } from "@tgcloud/ui/desktop/ui";
import { OfflineBadge } from "@tgcloud/ui/ui/Offline";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";


/** Top bar (56px): back/forward, breadcrumb and search. */
export function TopBar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const route = useRoute();
  const idx = useNav((s) => s.entry.idx);
  const [maxIdx, setMaxIdx] = useState(idx);
  useEffect(() => setMaxIdx((m) => (useNav.getState().direction === 1 ? idx : Math.max(m, idx))), [idx]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
      <IconButton label={t("nav.back")} onClick={nav.back} disabled={idx === 0}>
        <ArrowLeft />
      </IconButton>
      <IconButton label={t("nav.forward")} onClick={nav.forward} disabled={idx >= maxIdx}>
        <ArrowRight />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-hairline" />
      <Trail />
      <OfflineBadge touch={false} />
      <SearchBox inputRef={searchRef} initial={route.dest === "search" ? route.query : ""} />
    </header>
  );
}

function Trail() {
  const route = useRoute();
  const { data: path = [] } = usePath(route.dest === "files" ? route.folder : 0);
  const titles = { recent: t("nav.recent"), trash: ui("common.trash"), transfers: t("nav.transfers"), search: t("nav.search") };
  if (route.dest !== "files") return <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{titles[route.dest]}</h1>;
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-medium" aria-label={t("nav.path")}>
      <Crumb id={0} name={t("nav.myDrive")} last={path.length === 0} />
      {path.map((p, i) => (
        <span key={p.id} className="flex min-w-0 items-center gap-1">
          <span className="text-fg-3">/</span>
          <Crumb id={p.id} name={p.name} last={i === path.length - 1} />
        </span>
      ))}
    </nav>
  );
}

function Crumb({ id, name, last }: { id: number; name: string; last: boolean }) {
  const { over, handlers } = useDrop(id);
  return (
    <button
      {...handlers}
      onClick={() => nav.openFolder(id)}
      className={`truncate rounded-md px-2 py-1 ${over ? "bg-brand-soft ring-1 ring-brand" : last ? "text-fg" : "text-fg-2 hover:bg-s3 hover:text-fg"}`}
    >
      {name}
    </button>
  );
}

function SearchBox({ inputRef, initial }: { inputRef: React.RefObject<HTMLInputElement | null>; initial: string }) {
  const [text, setText] = useState(initial);
  const route = useRoute();
  const typed = useRef(false);
  useEffect(() => {
    if (route.dest !== "search") setText("");
  }, [route.dest]);
  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => (text ? nav.search(text) : route.dest === "search" && nav.back()), 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className="relative w-72">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setText("");
            e.currentTarget.blur();
          }
        }}
        placeholder={t("search.placeholder")}
        className="surface h-9 w-full rounded-lg border border-line bg-s3 pr-14 pl-9 text-[14px] outline-none placeholder:text-fg-3 hover:border-line-strong focus:border-brand focus:ring-[3px] focus:ring-brand/25"
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">{text ? null : <Kbd>/</Kbd>}</span>
      {text && (
        <button onClick={() => setText("")} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-fg-3 hover:text-fg" aria-label={t("search.clear")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Toolbar: selection actions on the left, view options on the right. */
export function Toolbar({ viewControls = true }: { viewControls?: boolean } = {}) {
  const route = useRoute();
  const count = useSelection((s) => s.ids.size);
  const view = useView();
  const details = useDesk((s) => s.details);
  const { data: trash = [] } = useTrash();
  const inTrash = route.dest === "trash";

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-4">
      {count > 0 ? (
        <div className="flex items-center gap-1 rounded-lg bg-brand-soft py-1 pr-1 pl-3 anim-fade">
          <span className="mr-2 text-[13px] font-semibold tabular">
            {ui("common.selected", { n: count })}
          </span>
          {inTrash ? (
            <>
              <Button capability="write" variant="ghost" onClick={cmd.restore}>
                <RotateCcw /> {ui("common.restore")}
              </Button>
              <Button capability="trash" variant="ghost" onClick={cmd.trash} className="!text-danger">
                <Trash2 /> {t("act.purge")}
              </Button>
            </>
          ) : (
            <>
              <IconButton label={t("act.downloadKey")} onClick={cmd.download}>
                <Download />
              </IconButton>
              {count === 1 && (
                <IconButton capability="write" label={t("act.renameKey")} onClick={cmd.rename}>
                  <Pencil />
                </IconButton>
              )}
              <IconButton capability="write" label={t("act.moveTo")} onClick={() => cmd.move("move")}>
                <FolderInput />
              </IconButton>
              <IconButton capability="write" label={t("act.copyTo")} onClick={() => cmd.move("copy")}>
                <Copy />
              </IconButton>
              <IconButton capability="trash" label={t("act.trashKey")} onClick={cmd.trash}>
                <Trash2 />
              </IconButton>
            </>
          )}
          <IconButton label={t("sel.clear")} onClick={() => useSelection.getState().clear()}>
            <X />
          </IconButton>
        </div>
      ) : inTrash && trash.length > 0 ? (
        <Button capability="trash" variant="ghost" onClick={() => nav.open({ type: "confirm", action: "empty", ids: [] })}>
          <Trash2 /> {t("act.emptyTrash")}
        </Button>
      ) : null}
      <div className="flex-1" />
      {viewControls && route.dest !== "transfers" && (
        <>
          <IconButton label={t("view.list")} active={view.layout === "list"} onClick={() => view.set({ layout: "list" })}>
            <List />
          </IconButton>
          <IconButton label={t("view.grid")} active={view.layout === "grid"} onClick={() => view.set({ layout: "grid" })}>
            <LayoutGrid />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-hairline" />
          <IconButton label={t("act.detailsKey")} active={details} onClick={() => useDesk.setState({ details: !details })}>
            <Info />
          </IconButton>
        </>
      )}
    </div>
  );
}
