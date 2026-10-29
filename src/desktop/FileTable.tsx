import { detectShell } from "@tgcloud/ui/core/platform";
import { CONTROLLER_EVENT, type ControllerEvent } from "@tgcloud/ui/tv/events";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Node } from "../core/api";
import { actions } from "../core/data";
import { formatDate, formatFullDate, formatSize, kindLabel, kindOf, sortNodes, type SortKey } from "../core/format";
import { useClipboard, useSelection, useView } from "../core/store";
import { FileIcon, MiniThumb, Thumb } from "@tgcloud/ui/media/FileIcon";
import { openMenu } from "@tgcloud/ui/desktop/Menu";
import { endDrag, startDrag, useDrop } from "./dnd";
import { backgroundMenu, cmd, itemMenu, useDesk } from "./state";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";

const controller = detectShell() === "tv";

/** Click, Ctrl/⌘+click and Shift+click, as in a file manager. */
function select(e: React.MouseEvent, n: Node) {
  const s = useSelection.getState();
  const visible = useDesk.getState().visible;
  if (e.shiftKey && s.anchor !== null) {
    const a = visible.findIndex((x) => x.id === s.anchor);
    const b = visible.findIndex((x) => x.id === n.id);
    const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
    s.set(e.ctrlKey || e.metaKey ? [...new Set([...s.ids, ...range])] : range);
  } else if (e.ctrlKey || e.metaKey) s.toggle(n.id);
  else s.set([n.id], n.id);
  s.setCursor(n.id);
}

function onItemContext(e: React.MouseEvent, n: Node) {
  e.preventDefault();
  e.stopPropagation();
  const s = useSelection.getState();
  if (!s.ids.has(n.id)) s.set([n.id], n.id);
  s.setCursor(n.id);
  openMenu(e.clientX, e.clientY, itemMenu());
}

const columns = (): { key: SortKey; label: string; className: string; align?: "right" }[] => [
  { key: "name", label: ui("common.name"), className: "" },
  { key: "size", label: t("sort.size"), className: "w-28", align: "right" },
  { key: "modified", label: t("sort.modified"), className: "w-40" },
  { key: "kind", label: t("sort.kind"), className: "w-32" },
];

export function FileView({ nodes, sortable = true }: { nodes: Node[]; sortable?: boolean }) {
  const view = useView();
  const list = sortable ? sortNodes(nodes, view.sort, view.asc) : nodes;
  const pane = useRef<HTMLDivElement>(null);
  const band = useRubberBand(pane);
  useEffect(() => {
    const el = pane.current;
    if (!el || !controller) return;
    const handle = (event: Event) => {
      const e = event as ControllerEvent;
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-tv-item][data-id]");
      const node = list.find(n => n.id === Number(target?.dataset.id));
      if (!node) return;
      if (e.detail.key === "Enter") cmd.open(node);
      else if (e.detail.key === "x") useSelection.getState().toggle(node.id);
      else if (e.detail.key === "ContextMenu") {
        const sel = useSelection.getState();
        if (!sel.ids.has(node.id)) sel.set([node.id], node.id);
        openMenu(0,0,itemMenu());
      } else return;
      e.preventDefault(); e.stopPropagation();
    };
    el.addEventListener(CONTROLLER_EVENT, handle);
    return () => el.removeEventListener(CONTROLLER_EVENT, handle);
  }, [list]);

  useEffect(() => {
    useDesk.setState({ visible: list });
  });

  const onBackground = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.background) {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) useSelection.getState().clear();
    }
  };

  return (
    <div
      ref={pane}
      className="relative min-h-full pb-16"
      data-background="true"
      onMouseDown={(e) => {
        onBackground(e);
        band.start(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const items = backgroundMenu();
        if (items.length) openMenu(e.clientX, e.clientY, items);
      }}
    >
      {view.layout === "grid" ? <Grid list={list} /> : <Table list={list} sortable={sortable} />}
      {band.rect && (
        <div
          className="pointer-events-none absolute rounded-sm border border-brand bg-brand/15"
          style={{ left: band.rect.x, top: band.rect.y, width: band.rect.w, height: band.rect.h }}
        />
      )}
    </div>
  );
}

function Table({ list, sortable }: { list: Node[]; sortable: boolean }) {
  const view = useView();
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[14px]" data-background="true">
      <thead className="sticky top-0 z-10 bg-canvas">
        <tr>
          {columns().map((c) => {
            const active = sortable && view.sort === c.key;
            return (
              <th
                key={c.key}
                scope="col"
                aria-sort={active ? (view.asc ? "ascending" : "descending") : undefined}
                className={`h-10 border-b border-hairline px-3 text-[11px] font-semibold tracking-[0.06em] text-fg-2 uppercase ${c.className} ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {sortable && detectShell() !== "tv" ? (
                  <button
                    onClick={() => view.set(active ? { asc: !view.asc } : { sort: c.key, asc: c.key === "name" })}
                    className={`group inline-flex items-center gap-1 uppercase hover:text-fg ${c.align === "right" ? "flex-row-reverse" : ""}`}
                  >
                    {c.label}
                    {active ? (
                      view.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUp size={12} className="opacity-0 group-hover:opacity-40" />
                    )}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {list.map((n) => (
          <Row key={n.id} node={n} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ node }: { node: Node }) {
  const selected = useSelection((s) => s.ids.has(node.id));
  const cursor = useSelection((s) => s.cursor === node.id);
  const renaming = useDesk((s) => s.renaming === node.id);
  const cut = useClipboard((s) => s.mode === "move" && s.ids.includes(node.id));
  const { over, handlers } = useDrop(node.is_dir ? node.id : null);
  const ref = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const cell = "h-9 border-b border-hairline px-3";
  return (
    <tr
      ref={ref}
      data-id={node.id}
      data-tv-item={controller ? "" : undefined}
      data-tv-options={controller ? "" : undefined}
      tabIndex={controller ? 0 : undefined}
      aria-label={controller ? node.name : undefined}
      draggable={!renaming}
      onDragStart={(e) => startDrag(e, node)}
      onDragEnd={endDrag}
      {...handlers}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.button === 0 && !(selected && !e.ctrlKey && !e.metaKey && !e.shiftKey)) select(e, node);
      }}
      onClick={(e) => {
        if (controller) return cmd.open(node);
        // A plain click on an already selected item (no modifier) collapses the selection to it.
        if (selected && !e.ctrlKey && !e.metaKey && !e.shiftKey && useSelection.getState().ids.size > 1) select(e, node);
      }}
      onDoubleClick={() => cmd.open(node)}
      onContextMenu={(e) => onItemContext(e, node)}
      className={`group cursor-default ${cut ? "opacity-50" : ""} ${
        over ? "bg-brand-soft outline outline-1 -outline-offset-1 outline-brand" : selected ? "bg-s4" : "hover:bg-s3"
      }`}
    >
      <td className={`${cell} relative`}>
        {selected && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand" />}
        <div className="flex min-w-0 items-center gap-2.5">
          <MiniThumb node={node} />
          {renaming ? <RenameInput node={node} /> : <span className="truncate text-fg" title={node.name}>{node.name}</span>}
        </div>
      </td>
      <td className={`${cell} text-right text-fg-2 tabular`}>{node.is_dir ? "—" : formatSize(node.size)}</td>
      <td className={`${cell} text-fg-2 tabular`} title={formatFullDate(node.modified_at)}>
        {formatDate(node.modified_at)}
      </td>
      <td className={`${cell} truncate text-fg-2`}>{kindLabel[kindOf(node)]}</td>
    </tr>
  );
}

function Grid({ list }: { list: Node[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 p-1" data-background="true">
      {list.map((n) => (
        <Card key={n.id} node={n} />
      ))}
    </div>
  );
}

function Card({ node }: { node: Node }) {
  const selected = useSelection((s) => s.ids.has(node.id));
  const renaming = useDesk((s) => s.renaming === node.id);
  const cut = useClipboard((s) => s.mode === "move" && s.ids.includes(node.id));
  const { over, handlers } = useDrop(node.is_dir ? node.id : null);
  return (
    <div
      data-id={node.id}
      data-tv-item={controller ? "" : undefined}
      data-tv-options={controller ? "" : undefined}
      tabIndex={controller ? 0 : undefined}
      aria-label={controller ? node.name : undefined}
      draggable={!renaming}
      onDragStart={(e) => startDrag(e, node)}
      onDragEnd={endDrag}
      {...handlers}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.button === 0) select(e, node);
      }}
      onDoubleClick={() => cmd.open(node)}
      onContextMenu={(e) => onItemContext(e, node)}
      className={`surface overflow-hidden rounded-xl bg-s1 ${cut ? "opacity-50" : ""} ${over || selected ? "outline-2 -outline-offset-2 outline-brand" : "hover:bg-s3"} ${selected ? "bg-s4" : ""}`}
    >
      <div className="aspect-[4/3] overflow-hidden bg-s2">
        <Thumb node={node} />
      </div>
      <div className="flex h-10 items-center gap-2 px-3">
        <FileIcon node={node} size={16} />
        {renaming ? <RenameInput node={node} /> : <span className="truncate text-[13px] font-medium">{node.name}</span>}
      </div>
    </div>
  );
}

/** Inline rename (F2): Enter confirms, Esc cancels, losing focus confirms. */
function RenameInput({ node }: { node: Node }) {
  const [value, setValue] = useState(node.name);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    useDesk.setState({ renaming: null });
    if (save && value.trim() && value.trim() !== node.name) actions.rename(node.id, value.trim());
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => {
        const dot = node.is_dir ? -1 : e.target.value.lastIndexOf(".");
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="h-7 min-w-0 flex-1 rounded-md border border-brand bg-s3 px-2 text-[14px] outline-none ring-[3px] ring-brand/25"
    />
  );
}

/** Selection rectangle when dragging over empty space. */
function useRubberBand(pane: React.RefObject<HTMLDivElement | null>) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const start = (e: React.MouseEvent) => {
    if (e.button !== 0 || !(e.target as HTMLElement).dataset.background || !pane.current) return;
    const box = pane.current.getBoundingClientRect();
    const ox = e.clientX - box.left;
    const oy = e.clientY - box.top;
    const base = e.ctrlKey || e.metaKey ? new Set(useSelection.getState().ids) : new Set<number>();
    const move = (ev: MouseEvent) => {
      const b = pane.current!.getBoundingClientRect();
      const x = ev.clientX - b.left;
      const y = ev.clientY - b.top;
      const r = { x: Math.min(ox, x), y: Math.min(oy, y), w: Math.abs(x - ox), h: Math.abs(y - oy) };
      if (r.w < 4 && r.h < 4) return;
      setRect(r);
      const hit = new Set(base);
      pane.current!.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => {
        const er = el.getBoundingClientRect();
        const left = er.left - b.left;
        const top = er.top - b.top;
        if (left < r.x + r.w && left + er.width > r.x && top < r.y + r.h && top + er.height > r.y) hit.add(Number(el.dataset.id));
      });
      useSelection.getState().set([...hit]);
    };
    const up = () => {
      setRect(null);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return { rect, start };
}
