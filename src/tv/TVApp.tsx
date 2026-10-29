import { VaultPermissionNotice } from "@tgcloud/ui/ui/VaultPermissionNotice";
import { canUseVault } from "@tgcloud/ui/core/vaultPermissions";
import { NavigationTabs } from "@tgcloud/ui/tv/NavigationTabs";
import { ViewOptions } from "./ViewOptions";
import { ControllerDetails } from "./Details";
import { Presence } from "@tgcloud/ui/ui/Presence";
import { FolderOpen, Clock, Trash2, Search, ArrowDownUp, HardDriveDownload, RefreshCw, LogOut, CheckSquare, ArrowDownAZ } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { TVShell, TVOptions, PadAction } from "@tgcloud/ui/tv/TVShell";
import { TVContextMenu } from "@tgcloud/ui/tv/TVContextMenu";
import { controllerAction } from "@tgcloud/ui/tv/events";
import { Toasts } from "@tgcloud/ui/desktop/Toasts";
import { notifyError } from "@tgcloud/ui/core/notices";
import { OfflineBadge } from "@tgcloud/ui/ui/Offline";
import { t as ui } from "@tgcloud/ui/i18n/ui";
import { api } from "../core/api";
import { findNode, refresh, refreshSoon, usePath } from "../core/data";
import { nav, useRoute, useLayers, type Dest } from "../core/nav";
import { uploads, useSelection, useUploads } from "../core/store";
import { DriveContent } from "../shared/DriveContent";
import { pickNative } from "../shared/pickFiles";
import { useOsDrop } from "../shared/useFileDrop";
import { DeskLayers } from "../desktop/Layers";
import { backgroundMenu, targetFolder, useDesk } from "../desktop/state";
import type { Session } from "../App";
import { t } from "../i18n";

export default function TVApp({ session }: { session: Session }) {
  const route = useRoute();
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef<HTMLElement | null>(null);
  const [tools, showTools] = useState(false);
  const selected = useSelection(s => s.ids);
  const layers = useLayers();
  useEffect(() => { if (layers.length) showTools(false); }, [layers.length]);
  const details = useDesk(s => s.details);
  const path = usePath(route.folder);
  useOsDrop();
  useEffect(() => {
    useDesk.setState({ pickFiles: () => { if (!canUseVault("write")) return; if (isTauri()) void pickNative(false); else input.current?.click(); }, pickFolder: () => { if (canUseVault("write") && isTauri()) void pickNative(true); } });
    useUploads.setState({ onDone: refreshSoon });
  }, []);
  useEffect(() => { useSelection.getState().clear(); useSelection.getState().setCursor(null); }, [route.dest, route.folder]);
  const back = () => { if (nav.layers().length) nav.close(); else if (selected.size) useSelection.getState().clear(); else if (route.folder || route.dest !== "files") nav.back(); };
  const icons = { files: FolderOpen, recent: Clock, trash: Trash2, search: Search, transfers: ArrowDownUp };
  const labels: Record<Dest, string> = { files: t("nav.files"), recent: t("nav.recent"), trash: ui("common.trash"), search: t("nav.search"), transfers: t("nav.transfers") };
  return <div className="tv-feature-shell" onFocusCapture={e => { const item = (e.target as HTMLElement).closest<HTMLElement>("[data-tv-item]"); if (item) focused.current = item; }}>
    <input ref={input} type="file" multiple hidden onChange={e => { if (e.target.files?.length) uploads.add(e.target.files, targetFolder()); e.target.value = ""; }} />
    <TVShell onOpenTransfers={() => nav.dest("transfers")} title="TGDrive" primaryLabel={ui(route.dest === "transfers" ? "common.select" : "common.open")} section={route.folder ? path.data?.[path.data.length - 1]?.name : labels[route.dest]} onBack={back} onSwitchVault={session.switchVault} contentClass="tv-feature-content" navigation={<>
      {(Object.keys(labels) as Dest[]).map(dest => { const Icon = icons[dest]; return <button key={dest} aria-current={dest === route.dest ? "page" : undefined} onClick={() => nav.dest(dest)}><Icon />{labels[dest]}</button>; })}
      <hr />{route.dest !== "transfers" && <button onClick={() => showTools(true)}><ArrowDownAZ />{t("act.view")} · {t("sort.by")}</button>}
      {backgroundMenu().map((entry, i) => entry === "sep" ? <hr key={i} /> : <button key={i} disabled={entry.disabled || !!entry.capability && !canUseVault(entry.capability)} onClick={entry.run}>{entry.icon ?? <CheckSquare />}{entry.label}</button>)}
      <button disabled={!canUseVault("write")} onClick={() => nav.open({ type: "import", parent: targetFolder() })}><HardDriveDownload />{t("act.importPhotos")}</button>
      {route.dest === "trash" && <button disabled={!canUseVault("trash")} onClick={() => nav.open({ type: "confirm", action: "empty", ids: [] })}><Trash2 />{t("act.emptyTrash")}</button>}
      <button onClick={() => void api.syncNow().then(refresh).catch(notifyError)}><RefreshCw />{t("account.sync")}</button>
      <button onClick={() => nav.open({ type: "confirm", action: "signout", ids: [] })}><LogOut />{ui("common.signOut")}</button>
    </>
    } commands={<>{route.dest !== "transfers" && <><PadAction code="X" onClick={() => { controllerAction(focused.current, "x"); }}>{ui("common.select")}</PadAction><PadAction code="Y" onClick={() => showTools(true)}>{t("act.view")}</PadAction></>}</>}>
      <VaultPermissionNotice /><div className="tv-feature-status"><OfflineBadge touch={false} />{route.dest === "search" && <input aria-label={t("nav.search")} placeholder={t("nav.search")} value={route.query} onChange={e => nav.search(e.target.value)} />}</div>
      {["files", "recent", "trash"].includes(route.dest) ? <NavigationTabs value={route.dest} tabs={(["files","recent","trash"] as const).map(value => ({value,label:labels[value]}))} label={ui("tv.sections")} onChange={value => nav.dest(value as Dest)}><DriveContent /></NavigationTabs> : <DriveContent />}
    </TVShell >
    <DeskLayers onSignedOut={session.signOut} /><TVContextMenu /><Toasts onOpenTransfers={() => nav.dest("transfers")} />
    <Presence>{tools && <TVOptions title={t("act.view")} onClose={() => showTools(false)}><ViewOptions /></TVOptions>}</Presence>
    <Presence>{details && <TVOptions title={t("act.details")} onClose={() => useDesk.setState({ details: false })}><ControllerDetails node={selected.size === 1 ? findNode([...selected][0]) : undefined} /></TVOptions>}</Presence>
  </div >;
}
