import { useState, type RefObject } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  Images,
  Info,
  LayoutGrid,
  List,
  Pencil,
  RotateCcw,
  Send,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import type { Node } from "../core/api";
import { actions, findNode, useFolders } from "../core/data";
import { formatSize, kindLabel, kindOf, type SortKey } from "../core/format";
import { DetailRows } from "../shared/Details";
import { android, available as onAndroid } from "@tgcloud/ui/core/android";
import { transfers } from "@tgcloud/ui/core/transfers";
import { nav, useRoute, type Layer } from "../core/nav";
import { useSelection, useView } from "../core/store";
import { FileIcon, FileTile } from "@tgcloud/ui/media/FileIcon";
import { ImportView } from "../shared/Import";
import { Sheet, SheetButton, SheetItem } from "@tgcloud/ui/ui/Sheet";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";


/** Download on mobile: folder picked once (Android); elsewhere, "Save as". */
export function downloadNodes(ids: number[]) {
  if (onAndroid) return transfers.downloadAndroid(ids, () => nav.dest("transfers"));
  const one = ids.length === 1 ? findNode(ids[0]) : undefined;
  if (one && !one.is_dir) return actions.saveAs(one);
}

export function NewSheet({ fileInput, parent }: { fileInput: RefObject<HTMLInputElement | null>; parent: number }) {
  // On Android the system picker grants persistent permission: the upload survives
  // closing the app and can pause/resume. Elsewhere, the page picker.
  const pick = (folder: boolean) =>
    nav.closeThen(async () => {
      if (!onAndroid) return fileInput.current?.click();
      const items = folder ? await android.pickFolder() : await android.pickFiles();
      void transfers.uploadUris(items, parent);
    });
  return (
    <Sheet>
      <SheetItem icon={<Upload />} onClick={() => pick(false)}>
        {t("act.uploadFiles")}
      </SheetItem>
      {onAndroid && (
        <SheetItem icon={<FolderUp />} onClick={() => pick(true)}>
          {t("act.uploadFolder")}
        </SheetItem>
      )}
      <SheetItem icon={<FolderPlus />} onClick={() => nav.replaceTop({ type: "name", mode: "mkdir", parent })}>
        {ui("common.newFolder")}
      </SheetItem>
      <SheetItem icon={<Images />} onClick={() => nav.replaceTop({ type: "import", parent })}>
        {t("act.importPhotos")}
      </SheetItem>
    </Sheet>
  );
}

export function ActionsSheet({ ids }: { ids: number[] }) {
  const route = useRoute();
  const nodes = ids.map(findNode).filter((n): n is Node => !!n);
  if (!nodes.length) return null;
  const one = nodes.length === 1 ? nodes[0] : null;
  const inTrash = route.dest === "trash";
  const after = (fn: () => void) => nav.closeThen(fn);

  const header = one ? (
    <div className="flex items-center gap-3">
      <FileTile node={one} size={40} />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{one.name}</p>
        <p className="text-[12px] text-fg-3">{one.is_dir ? ui("common.folder") : `${kindLabel[kindOf(one)]} · ${formatSize(one.size)}`}</p>
      </div>
    </div>
  ) : (
    <p className="text-[15px] font-semibold">{t("sel.count", { n: nodes.length })}</p>
  );

  if (inTrash)
    return (
      <Sheet title={header}>
        <SheetItem icon={<RotateCcw />} onClick={() => after(() => actions.restore(ids))}>
          {ui("common.restore")}
        </SheetItem>
        <SheetItem icon={<Trash2 />} danger onClick={() => nav.replaceTop({ type: "confirm", action: "purge", ids })}>
          {t("act.purge")}
        </SheetItem>
      </Sheet>
    );

  return (
    <Sheet title={header}>
      {one && !one.is_dir && (
        <>
          <SheetItem icon={<Eye />} onClick={() => nav.replaceTop({ type: "viewer", id: one.id, siblings: [one.id] })}>
            {ui("common.open")}
          </SheetItem>
          <SheetItem icon={<Download />} onClick={() => after(() => void downloadNodes(ids))}>
            {ui("common.download")}
          </SheetItem>
          {onAndroid && (
            <SheetItem icon={<Share2 />} onClick={() => after(() => void transfers.share(one))}>
              {ui("common.share")}
            </SheetItem>
          )}
        </>
      )}
      {one?.is_dir && (
        <>
          <SheetItem icon={<Folder />} onClick={() => after(() => nav.openFolder(one.id))}>
            {t("act.openFolder")}
          </SheetItem>
          {onAndroid && (
            <SheetItem icon={<Download />} onClick={() => after(() => void downloadNodes(ids))}>
              {t("act.downloadFolder")}
            </SheetItem>
          )}
        </>
      )}
      {!one && onAndroid && (
        <SheetItem icon={<Download />} onClick={() => after(() => void downloadNodes(ids))}>
          {t("act.downloadN", { n: nodes.length })}
        </SheetItem>
      )}
      {one && (
        <SheetItem icon={<Pencil />} onClick={() => nav.replaceTop({ type: "name", mode: "rename", id: one.id, parent: one.parent_id })}>
          {ui("common.rename")}
        </SheetItem>
      )}
      <SheetItem icon={<FolderInput />} onClick={() => nav.replaceTop({ type: "move", ids, mode: "move" })}>
        {ui("common.move")}
      </SheetItem>
      <SheetItem icon={<Copy />} onClick={() => nav.replaceTop({ type: "move", ids, mode: "copy" })}>
        {t("act.makeCopy")}
      </SheetItem>
      <SheetItem icon={<Send />} onClick={() => nav.replaceTop({ type: "send-vault", ids })}>
        {t("act.sendVault")}
      </SheetItem>
      {one && (
        <SheetItem icon={<Info />} onClick={() => nav.replaceTop({ type: "details", id: one.id })}>
          {t("act.details")}
        </SheetItem>
      )}
      <div className="my-1 border-t border-hairline" />
      <SheetItem icon={<Trash2 />} danger onClick={() => after(() => actions.trash(ids))}>
        {t("act.trash")}
      </SheetItem>
    </Sheet>
  );
}

export function NameSheet({ layer }: { layer: Extract<Layer, { type: "name" }> }) {
  const node = layer.id ? findNode(layer.id) : undefined;
  const [name, setName] = useState(node?.name ?? ui("common.newFolder"));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (layer.mode === "mkdir") await actions.mkdir(layer.parent, name);
      else if (layer.id) await actions.rename(layer.id, name);
      nav.close();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Sheet>
      <form
        className="px-5 pt-2 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-[18px] font-semibold">{layer.mode === "mkdir" ? ui("common.newFolder") : ui("common.rename")}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => {
            // Selects the name without the extension, like file managers.
            const dot = node && !node.is_dir ? e.target.value.lastIndexOf(".") : -1;
            e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
          }}
          className="surface mt-4 h-12 w-full rounded-xl border border-line bg-s3 px-4 text-[16px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        <div className="mt-5 flex gap-3">
          <SheetButton onClick={nav.close}>{ui("common.cancel")}</SheetButton>
          <SheetButton type="submit" primary disabled={!name.trim() || busy}>
            {layer.mode === "mkdir" ? ui("common.create") : ui("common.save")}
          </SheetButton>
        </div>
      </form>
    </Sheet>
  );
}

/** Destination choice: navigates the tree inside the sheet itself. */
export function MoveSheet({ layer }: { layer: Extract<Layer, { type: "move" }> }) {
  const { data: folders = [] } = useFolders();
  const [at, setAt] = useState(0);
  const moving = new Set(layer.ids);
  const here = folders.find((f) => f.id === at);
  const children = folders.filter((f) => f.parent_id === at && !moving.has(f.id));
  return (
    <Sheet
      title={
        <div className="flex items-center gap-2">
          {at !== 0 && (
            <button onClick={() => setAt(here?.parent_id ?? 0)} className="-ml-2 grid size-10 place-items-center rounded-full active:bg-s4" aria-label={ui("common.back")}>
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-[12px] text-fg-3">{t(layer.mode === "move" ? "move.to.move" : "move.to.copy")}</p>
            <p className="truncate text-[16px] font-semibold">{here?.name ?? t("nav.myDrive")}</p>
          </div>
        </div>
      }
    >
      {children.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-fg-3">{t("move.noSub")}</p>}
      {children.map((f) => (
        <button key={f.id} onClick={() => setAt(f.id)} className="flex min-h-14 w-full items-center gap-4 px-5 text-left active:bg-s4">
          <FileIcon node={f} size={24} />
          <span className="flex-1 truncate text-[15px]">{f.name}</span>
          <ChevronRight size={18} className="text-fg-3" />
        </button>
      ))}
      <div className="flex gap-3 px-5 pt-3 pb-2">
        <SheetButton onClick={nav.close}>{ui("common.cancel")}</SheetButton>
        <SheetButton
          primary
          onClick={() =>
            nav.closeThen(() => {
              const name = here?.name ?? t("nav.myDrive");
              if (layer.mode === "move") actions.move(layer.ids, at, name);
              else actions.copy(layer.ids, at, name);
            })
          }
        >
          {t(layer.mode === "move" ? "move.here.move" : "move.here.copy")}
        </SheetButton>
      </div>
    </Sheet>
  );
}

export function ConfirmSheet({ layer, onSignedOut }: { layer: Extract<Layer, { type: "confirm" }>; onSignedOut: () => void }) {
  const text = {
    purge: {
      title: layer.ids.length === 1 ? t("purge.title") : t("purge.titleMany", { n: layer.ids.length }),
      body: t("purge.body"),
      cta: t("purge.cta"),
      run: () => actions.purge(layer.ids),
    },
    empty: {
      title: t("empty.confirmTitle"),
      body: t("empty.confirmBody"),
      cta: t("empty.cta"),
      run: () => actions.emptyTrash(),
    },
    signout: {
      title: t("signout.title"),
      body: t("signout.body"),
      cta: ui("common.signOut"),
      run: onSignedOut,
    },
  }[layer.action];
  return (
    <Sheet>
      <div className="px-5 pt-2 pb-3">
        <p className="text-[18px] font-semibold">{text.title}</p>
        <p className="mt-2 text-[14px] text-fg-2">{text.body}</p>
        <div className="mt-6 flex gap-3">
          <SheetButton onClick={nav.close}>{ui("common.cancel")}</SheetButton>
          <SheetButton primary danger onClick={() => nav.closeThen(() => void text.run())}>
            {text.cta}
          </SheetButton>
        </div>
      </div>
    </Sheet>
  );
}

const sorts = (): { key: SortKey; label: string }[] => [
  { key: "name", label: ui("common.name") },
  { key: "modified", label: t("sort.modified") },
  { key: "size", label: t("sort.size") },
  { key: "kind", label: t("sort.kind") },
];

export function SortSheet() {
  const view = useView();
  return (
    <Sheet title={<p className="text-[16px] font-semibold">{t("act.view")}</p>}>
      <div className="flex gap-2 px-5 py-2">
        {(["list", "grid"] as const).map((l) => (
          <button
            key={l}
            onClick={() => view.set({ layout: l })}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold ${view.layout === l ? "bg-brand-soft text-fg ring-1 ring-brand/40" : "surface bg-s3 text-fg-2"}`}
          >
            {l === "list" ? <List size={18} /> : <LayoutGrid size={18} />}
            {l === "list" ? t("view.list") : t("view.grid")}
          </button>
        ))}
      </div>
      <p className="px-5 pt-4 pb-1 text-[11px] font-semibold tracking-[0.06em] text-fg-3 uppercase">{t("sort.by")}</p>
      {sorts().map((s) => (
        <SheetItem
          key={s.key}
          icon={view.sort === s.key ? view.asc ? <ArrowUpAZ className="!text-brand" /> : <ArrowDownAZ className="!text-brand" /> : <span className="size-6" />}
          onClick={() => view.set(view.sort === s.key ? { asc: !view.asc } : { sort: s.key, asc: s.key === "name" })}
          hint={view.sort === s.key ? (view.asc ? t("sort.asc") : t("sort.desc")) : undefined}
        >
          {s.label}
        </SheetItem>
      ))}
    </Sheet>
  );
}

export function DetailsSheet({ id }: { id: number }) {
  const node = findNode(id);
  if (!node) return null;
  return (
    <Sheet
      title={
        <div className="flex items-center gap-3">
          <FileTile node={node} size={48} />
          <p className="min-w-0 flex-1 text-[16px] font-semibold break-words">{node.name}</p>
        </div>
      }
    >
      <div className="px-5 py-2">
        <DetailRows node={node} touch />
      </div>
    </Sheet>
  );
}

/** Clears the mobile selection when the selection layer leaves the stack. */
export const clearSelection = () => useSelection.getState().clear();

/** "Share → TGDrive": picks the destination folder and queues the upload. */
export function ReceiveSheet({ layer }: { layer: Extract<Layer, { type: "receive" }> }) {
  const { data: folders = [] } = useFolders();
  const [at, setAt] = useState(0);
  const here = folders.find((f) => f.id === at);
  const children = folders.filter((f) => f.parent_id === at);
  const n = layer.items.length;
  return (
    <Sheet
      title={
        <div className="flex items-center gap-2">
          {at !== 0 && (
            <button onClick={() => setAt(here?.parent_id ?? 0)} className="-ml-2 grid size-10 place-items-center rounded-full active:bg-s4" aria-label={ui("common.back")}>
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-[12px] text-fg-3">
              {n === 1 ? t("receive.toOne", { name: layer.items[0].name }) : t("receive.toMany", { n })}
            </p>
            <p className="truncate text-[16px] font-semibold">{here?.name ?? t("nav.myDrive")}</p>
          </div>
        </div>
      }
    >
      {children.map((f) => (
        <button key={f.id} onClick={() => setAt(f.id)} className="flex min-h-14 w-full items-center gap-4 px-5 text-left active:bg-s4">
          <FileIcon node={f} size={24} />
          <span className="flex-1 truncate text-[15px]">{f.name}</span>
          <ChevronRight size={18} className="text-fg-3" />
        </button>
      ))}
      <div className="flex gap-3 px-5 pt-3 pb-2">
        <SheetButton onClick={nav.close}>{ui("common.cancel")}</SheetButton>
        <SheetButton primary onClick={() => nav.closeThen(() => void transfers.uploadUris(layer.items, at))}>
          {t("receive.here")}
        </SheetButton>
      </div>
    </Sheet>
  );
}

export function ImportSheet({ parent }: { parent: number }) {
  return (
    <Sheet title={<p className="text-[16px] font-semibold">{t("act.importPhotos")}</p>}>
      <ImportView touch parent={parent} />
    </Sheet>
  );
}
