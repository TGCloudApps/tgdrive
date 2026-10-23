/**
 * TGDrive viewer: the shared lightbox with the file actions
 * (download, share, trash) and the node details.
 */
import { Download, RotateCcw, Send, Share2, Trash2 } from "lucide-react";
import { available as onAndroid } from "@tgcloud/ui/core/android";
import { transfers } from "@tgcloud/ui/core/transfers";
import { HudButton, Lightbox, type LightboxMenuItem } from "@tgcloud/ui/media/Lightbox";
import type { Node } from "../core/api";
import { actions, findNode } from "../core/data";
import { nav, useLayers, useRoute, type Layer } from "../core/nav";
import { DetailRows } from "./Details";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";

const go = (id: number, siblings: number[]) => nav.replaceTop({ type: "viewer", id, siblings });

export function Viewer({ layer, touch }: { layer: Extract<Layer, { type: "viewer" }>; touch: boolean }) {
  const layers = useLayers();
  const inTrash = useRoute().dest === "trash";
  const top = layers[layers.length - 1]?.type;

  const save = (node: Node) => {
    if (touch && onAndroid) void transfers.downloadAndroid([node.id], () => nav.closeThen(() => nav.dest("transfers")));
    else if (touch) actions.saveAs(node);
    else transfers.download([node.id], () => nav.closeThen(() => nav.dest("transfers")));
  };
  const purge = (node: Node) => nav.open({ type: "confirm", action: "purge", ids: [node.id] });

  return (
    <Lightbox<Node>
      id={layer.id}
      siblings={layer.siblings}
      find={findNode}
      touch={touch}
      active={top === "viewer"}
      onGo={go}
      onClose={nav.close}
      infoTouch={touch && top === "details"}
      menuTouch={top === "viewer-menu"}
      openMenuTouch={() => nav.open({ type: "viewer-menu" })}
      menu={(node, { leave }): LightboxMenuItem[] =>
        inTrash
          ? [
              { label: ui("common.restore"), icon: <RotateCcw />, run: () => leave(() => actions.restore([node.id])) },
              { label: t("act.purge"), icon: <Trash2 />, danger: true, run: () => purge(node) },
            ]
          : [
              ...(onAndroid ? [{ label: ui("common.share"), icon: <Share2 />, run: () => void transfers.share(node) }] : []),
              { label: ui("common.download"), icon: <Download />, run: () => save(node) },
              { label: t("act.sendVaultMenu"), icon: <Send />, run: () => nav.open({ type: "send-vault", ids: [node.id] }) },
              { label: t("act.trash"), icon: <Trash2 />, danger: true, run: () => leave(() => actions.trash([node.id])) },
            ]
      }
      openInfoTouch={() => nav.open({ type: "details", id: layer.id })}
      onSave={save}
      info={(node, tt) => <DetailRows node={node} touch={tt} />}
      keys={(node, { leave }) => ({
        d: () => save(node),
        D: () => save(node),
        Delete: () => (inTrash ? purge(node) : leave(() => actions.trash([node.id]))),
      })}
      actions={(node, { leave }) => (
        <>
          {touch && onAndroid && !inTrash && (
            <HudButton touch={touch} label={ui("common.share")} onClick={() => void transfers.share(node)}>
              <Share2 />
            </HudButton>
          )}
          {inTrash ? (
            <>
              <HudButton touch={touch} label={ui("common.restore")} onClick={() => leave(() => actions.restore([node.id]))}>
                <RotateCcw />
              </HudButton>
              <HudButton touch={touch} label={t("act.purgeKey")} onClick={() => purge(node)} danger>
                <Trash2 />
              </HudButton>
            </>
          ) : (
            <>
              <HudButton touch={touch} label={touch ? ui("common.download") : t("act.downloadD")} onClick={() => save(node)}>
                <Download />
              </HudButton>
              <HudButton touch={touch} label={t("act.trashKey")} onClick={() => leave(() => actions.trash([node.id]))}>
                <Trash2 />
              </HudButton>
            </>
          )}
        </>
      )}
    />
  );
}
