import { useRef } from "react";
import { Check, MoreVertical } from "lucide-react";
import type { Node } from "../core/api";
import { formatDate, formatSize } from "../core/format";
import { nav, useLayers } from "../core/nav";
import { haptic } from "@tgcloud/ui/core/platform";
import { useSelection, useView } from "../core/store";
import { FileTile, Thumb } from "@tgcloud/ui/media/FileIcon";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";

/** Short tap opens; long tap (450 ms still) enters selection. */
function usePress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      origin.current = [e.clientX, e.clientY];
      timer.current = window.setTimeout(() => {
        fired.current = true;
        haptic();
        onLong();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o[0], e.clientY - o[1]) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      if (!fired.current) onTap();
    },
  };
}

export function FileList({ nodes, onOpen }: { nodes: Node[]; onOpen: (n: Node) => void }) {
  const layout = useView((s) => s.layout);
  const selecting = useLayers().some((l) => l.type === "selection");
  const selected = useSelection((s) => s.ids);

  const tap = (n: Node) => {
    if (selecting) {
      useSelection.getState().toggle(n.id);
      if (useSelection.getState().ids.size === 0) nav.close();
    } else onOpen(n);
  };
  const long = (n: Node) => {
    if (!selecting) {
      useSelection.getState().set([n.id], n.id);
      nav.open({ type: "selection" });
    } else useSelection.getState().toggle(n.id);
  };

  if (layout === "grid")
    return (
      <div className="grid grid-cols-2 gap-3 px-4 pt-1 pb-4 md:grid-cols-3">
        {nodes.map((n) => (
          <GridCard key={n.id} node={n} selected={selected.has(n.id)} selecting={selecting} onTap={() => tap(n)} onLong={() => long(n)} />
        ))}
      </div>
    );
  return (
    <div className="pb-4">
      {nodes.map((n) => (
        <Row key={n.id} node={n} selected={selected.has(n.id)} selecting={selecting} onTap={() => tap(n)} onLong={() => long(n)} />
      ))}
    </div>
  );
}

type ItemProps = { node: Node; selected: boolean; selecting: boolean; onTap: () => void; onLong: () => void };

function Row({ node, selected, selecting, onTap, onLong }: ItemProps) {
  const press = usePress(onTap, onLong);
  return (
    <div
      {...press}
      className={`flex h-[var(--row-height-touch)] items-center gap-4 pr-1 pl-4 select-none ${selected ? "bg-brand-soft" : "active:bg-s3"}`}
    >
      <div className="relative">
        <FileTile node={node} size={40} />
        {selected && (
          <div className="absolute inset-0 grid place-items-center rounded-[10px] bg-brand text-white anim-pop">
            <Check size={22} strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-fg">{node.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-fg-3 tabular">
          {node.is_dir ? ui("common.folder") : formatSize(node.size)} · {formatDate(node.modified_at)}
        </p>
      </div>
      {!selecting && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            nav.open({ type: "actions", ids: [node.id] });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid size-12 shrink-0 place-items-center rounded-full text-fg-2 active:bg-s4"
          aria-label={t("act.actionsOf", { name: node.name })}
        >
          <MoreVertical size={20} />
        </button>
      )}
    </div>
  );
}

function GridCard({ node, selected, selecting, onTap, onLong }: ItemProps) {
  const press = usePress(onTap, onLong);
  return (
    <div
      {...press}
      className={`surface relative overflow-hidden rounded-xl bg-s1 select-none active:bg-s3 ${selected ? "bg-brand-soft outline-2 -outline-offset-2 outline-brand" : ""}`}
    >
      <div className="aspect-[4/3] overflow-hidden bg-s2">
        <Thumb node={node} icon={44} />
      </div>
      <div className="flex items-center gap-1 py-2 pr-1 pl-3">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{node.name}</p>
        {!selecting && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nav.open({ type: "actions", ids: [node.id] });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="grid size-10 place-items-center rounded-full text-fg-2 active:bg-s4"
            aria-label={t("act.actionsOf", { name: node.name })}
          >
            <MoreVertical size={18} />
          </button>
        )}
      </div>
      {selected && (
        <div className="absolute top-2 left-2 grid size-7 place-items-center rounded-full bg-brand text-white anim-pop">
          <Check size={16} strokeWidth={3} />
        </div>
      )}
    </div>
  );
}
