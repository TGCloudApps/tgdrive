import { useState } from "react";
import { PresenceList } from "@tgcloud/ui/ui/Presence";
import { ChevronRight, CornerLeftUp, Trash2, X } from "lucide-react";
import type { Node } from "../core/api";
import { actions, findNode, useFolders } from "../core/data";
import { nav, useLayers, type Layer } from "../core/nav";
import { FileIcon, Thumb } from "@tgcloud/ui/media/FileIcon";
import { DetailRows } from "../shared/Details";
import { Viewer } from "../shared/Viewer";
import { ImportView } from "../shared/Import";
import { SendToVault } from "@tgcloud/ui/ui/SendToVault";
import { useDesk } from "./state";
import { Button, Dialog, Field, IconButton } from "@tgcloud/ui/desktop/ui";
import { LanguagePicker } from "@tgcloud/ui/ui/LanguagePicker";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";


/** Desktop layers: dialogs and the lightbox (they also respond to back). */
export function DeskLayers({ onSignedOut }: { onSignedOut: () => void }) {
  const layers = useLayers();
  const top = layers[layers.length - 1];
  const viewer = layers.find((l): l is Extract<Layer, { type: "viewer" }> => l.type === "viewer");
  // Each one leaves with an animation before unmounting.
  const items = [
    ...(viewer ? [{ key: "viewer", node: <Viewer layer={viewer} touch={false} />, instant: true }] : []),
    ...(top && top.type !== "viewer" ? [{ key: `${layers.length}-${top.type}`, node: <DeskLayer top={top} onSignedOut={onSignedOut} n={layers.length} /> }] : []),
  ];
  return <PresenceList items={items} />;
}

function DeskLayer({ top, onSignedOut, n }: { top: Layer; onSignedOut: () => void; n: number }) {
  switch (top.type) {
    case "name":
      return <NameDialog key={n} layer={top} />;
    case "move":
      return <MoveDialog key={n} layer={top} />;
    case "confirm":
      return <ConfirmDialog key={n} layer={top} onSignedOut={onSignedOut} />;
    case "viewer":
      return <Viewer key="viewer" layer={top} touch={false} />;
    case "send-vault":
      return <SendToVault key={n} ids={top.ids} touch={false} onClose={nav.close} />;
    case "import":
      return (
        <Dialog key={n} onClose={nav.close} width={520}>
          <h2 className="pb-3 text-[16px] font-semibold">{t("act.importPhotos")}</h2>
          <ImportView touch={false} parent={top.parent} />
        </Dialog>
      );
    case "language":
      return (
        <Dialog key={n} onClose={nav.close} width={400}>
          <h2 className="pb-3 text-[16px] font-semibold">{ui("common.language")}</h2>
          <LanguagePicker touch={false} onChange={() => nav.close()} />
        </Dialog>
      );
    default:
      return null;
  }
}

function NameDialog({ layer }: { layer: Extract<Layer, { type: "name" }> }) {
  const node = layer.id ? findNode(layer.id) : undefined;
  const [name, setName] = useState(node?.name ?? ui("common.newFolder"));
  const submit = async () => {
    if (!name.trim()) return;
    try {
      if (layer.mode === "mkdir") await actions.mkdir(layer.parent, name);
      else if (layer.id) await actions.rename(layer.id, name);
      nav.close();
    } catch {
      /* the toast already showed the error */
    }
  };
  return (
    <Dialog onClose={nav.close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-[16px] font-semibold">{layer.mode === "mkdir" ? ui("common.newFolder") : ui("common.rename")}</h2>
        <Field autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} className="mt-4" />
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={nav.close}>{ui("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            {layer.mode === "mkdir" ? ui("common.create") : ui("common.rename")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({ layer }: { layer: Extract<Layer, { type: "move" }> }) {
  const { data: folders = [] } = useFolders();
  const [at, setAt] = useState(0);
  const moving = new Set(layer.ids);
  const here = folders.find((f) => f.id === at);
  const children = folders.filter((f) => f.parent_id === at && !moving.has(f.id));
  const run = () =>
    nav.closeThen(() => {
      const name = here?.name ?? t("nav.myDrive");
      if (layer.mode === "move") actions.move(layer.ids, at, name);
      else actions.copy(layer.ids, at, name);
    });
  return (
    <Dialog onClose={nav.close} width={520}>
      <h2 className="text-[16px] font-semibold">
        {layer.ids.length === 1
          ? t(layer.mode === "move" ? "move.titleOne.move" : "move.titleOne.copy", { name: findNode(layer.ids[0])?.name ?? "" })
          : t(layer.mode === "move" ? "move.titleMany.move" : "move.titleMany.copy", { n: layer.ids.length })}
      </h2>
      <div className="mt-4 flex h-9 items-center gap-1 text-[13px] font-medium text-fg-2">
        <IconButton label={t("nav.upOne")} disabled={at === 0} onClick={() => setAt(here?.parent_id ?? 0)}>
          <CornerLeftUp />
        </IconButton>
        <span className="truncate text-fg">{here?.name ?? t("nav.myDrive")}</span>
      </div>
      <div className="surface mt-2 h-64 overflow-y-auto rounded-xl bg-s1 p-1">
        {children.length === 0 && <p className="grid h-full place-items-center text-[13px] text-fg-3">{t("move.noSub")}</p>}
        {children.map((f) => (
          <button
            key={f.id}
            onDoubleClick={() => setAt(f.id)}
            onClick={() => setAt(f.id)}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] hover:bg-s3"
          >
            <FileIcon node={f} />
            <span className="flex-1 truncate">{f.name}</span>
            <ChevronRight size={14} className="text-fg-3" />
          </button>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={nav.close}>{ui("common.cancel")}</Button>
        <Button variant="primary" onClick={run}>
          {t(layer.mode === "move" ? "move.btn.move" : "move.btn.copy", { name: here?.name ?? t("nav.myDrive") })}
        </Button>
      </div>
    </Dialog>
  );
}

function ConfirmDialog({ layer, onSignedOut }: { layer: Extract<Layer, { type: "confirm" }>; onSignedOut: () => void }) {
  const text = {
    purge: {
      title: layer.ids.length === 1 ? t("purge.titleNamed", { name: findNode(layer.ids[0])?.name ?? "" }) : t("purge.titleMany", { n: layer.ids.length }),
      body: t("purge.body"),
      cta: t("act.purge"),
      run: () => actions.purge(layer.ids),
    },
    empty: {
      title: t("empty.confirmTitle"),
      body: t("empty.confirmBody"),
      cta: t("act.emptyTrash"),
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
    <Dialog onClose={nav.close}>
      <div className="flex gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
          <Trash2 size={18} />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold">{text.title}</h2>
          <p className="mt-1.5 text-[14px] text-fg-2">{text.body}</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={nav.close}>{ui("common.cancel")}</Button>
        <Button variant="danger" onClick={() => nav.closeThen(() => void text.run())}>
          {text.cta}
        </Button>
      </div>
    </Dialog>
  );
}

/** Details panel (Ctrl+I), 320px on the right, from the toolbar to the bottom. */
export function DetailsPanel({ node }: { node: Node | undefined }) {
  return (
    <aside className="lb-panel flex w-80 shrink-0 flex-col border-l border-hairline bg-s1">
      <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-5">
        <p className="text-[13px] font-semibold text-fg-2">{t("act.details")}</p>
        <IconButton label={t("act.closeDetails")} onClick={() => useDesk.setState({ details: false })}>
          <X />
        </IconButton>
      </div>
      {!node ? (
        <p className="px-5 py-10 text-center text-[13px] text-fg-3">{t("details.pick")}</p>
      ) : (
        <div className="min-h-0 overflow-y-auto px-5 pb-6">
          <div className="surface aspect-[4/3] overflow-hidden rounded-xl bg-s2">
            <Thumb node={node} icon={56} />
          </div>
          <p className="mt-4 mb-4 text-[15px] font-semibold break-words">{node.name}</p>
          <DetailRows node={node} />
        </div>
      )}
    </aside>
  );
}
