import { UpdateNotice } from "@tgcloud/ui/ui/Update";
import { VaultPermissionNotice } from "@tgcloud/ui/ui/VaultPermissionNotice";
import { openVaultMembers, canViewVaultMembers } from "@tgcloud/ui/core/vaultManagement";
import { Users } from "lucide-react";
import { ArrowDownUp, ChevronsUpDown, Clock, FolderPlus, FolderUp, HardDrive, Images, LogOut, Plus, RefreshCw, Repeat, Trash2, Upload } from "lucide-react";
import { VaultAvatar } from "@tgcloud/ui/ui/VaultAvatar";
import { useCurrentVault } from "@tgcloud/ui/core/vault";
import { Avatar } from "@tgcloud/ui/ui/Avatar";
import { useMe } from "@tgcloud/ui/core/me";
import { api } from "../core/api";
import type { Session } from "../App";
import { refresh, useUsage } from "../core/data";
import { formatSize } from "../core/format";
import { nav, useRoute, type Dest } from "../core/nav";
import { notifyError } from "../core/store";
import { isLive, useTransfers } from "@tgcloud/ui/core/transfers";
import { openMenu } from "@tgcloud/ui/desktop/Menu";
import { useDrop } from "./dnd";
import { cmd, targetFolder, useDesk } from "./state";
import { createElement as h } from "react";
import { Globe } from "lucide-react";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";


export function Sidebar({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const route = useRoute();
  const { data: usage } = useUsage();
  const live = useTransfers((s) => s.list.filter(isLive).length);
  const me = useMe((s) => s.me);
  // The photo can change in the vaults list (the session keeps the one from opening).
  const vault = useCurrentVault((s) => s.vault);

  return (
    <aside className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-hairline bg-s1">
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(r.left + 8, r.bottom, [
            ...(canViewVaultMembers() ? [{ label: ui("members.title"), icon: h(Users), run: openVaultMembers }] : []),
            { label: t("account.switchMenu"), icon: h(Repeat), run: session.switchVault },
            { label: t("account.sync"), icon: h(RefreshCw), run: () => void api.syncNow().then(() => refresh()).catch(notifyError) },
            { label: t("account.languageMenu"), icon: h(Globe), run: () => nav.open({ type: "language" }) },
            "sep",
            { label: t("account.signOut"), icon: h(LogOut), danger: true, run: onSignOut },
          ]);
        }}
        className="mx-2 mt-2 mb-1 flex h-12 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-s3"
        title={t("account.vaultOpen")}
      >
        <VaultAvatar vault={vault ?? session.vault} size={28} className="step rounded-lg bg-brand text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5 font-bold tracking-tight">{session.vault.name}</p>
          <p className="text-[11px] leading-4 font-medium text-fg-3">TGDrive</p>
        </div>
        <ChevronsUpDown size={16} className="shrink-0 text-fg-3" />
      </button>

      <div className="px-3 pb-3"><VaultPermissionNotice />
        <button disabled={vault?.can_post === false}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(r.left, r.bottom + 4, [
              { capability: "write" as const, label: t("act.uploadFilesMenu"), icon: h(Upload), shortcut: "Mod+U", run: () => useDesk.getState().pickFiles() },
              { capability: "write" as const, label: t("act.uploadFolderMenu"), icon: h(FolderUp), run: () => useDesk.getState().pickFolder() },
              { capability: "write" as const, label: ui("common.newFolder"), icon: h(FolderPlus), shortcut: "Mod+Shift+N", run: cmd.newFolder },
              "sep",
              { capability: "write" as const, label: t("act.importPhotosMenu"), icon: h(Images), run: () => nav.open({ type: "import", parent: targetFolder() }) },
            ]);
          }}
          className="step disabled:bg-s3 disabled:text-fg-off disabled:opacity-60 disabled:shadow-none flex h-10 w-full items-center gap-2 rounded-lg bg-brand px-3.5 text-[14px] font-semibold text-white hover:brightness-110 active:translate-y-0.5 active:shadow-none"
        >
          <Plus size={18} /> {t("new")}
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        <NavItem dest="files" folder={0} icon={<HardDrive />} label={t("nav.myDrive")} active={route.dest === "files" && route.folder === 0} />
        <NavItem dest="recent" icon={<Clock />} label={t("nav.recent")} active={route.dest === "recent"} />
        <NavItem dest="trash" icon={<Trash2 />} label={ui("common.trash")} active={route.dest === "trash"} />
        <NavItem
          dest="transfers"
          icon={<ArrowDownUp />}
          label={t("nav.transfers")}
          active={route.dest === "transfers"}
          badge={live || undefined}
        />

      </nav>

      <div className="border-t border-hairline p-3">
        <UpdateNotice />
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
          <Avatar size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg">{me?.name || t("account.yours")}</p>
            <p className="truncate text-[12px] text-fg-3 tabular">{usage ? t("account.usageDesk", { n: usage.files, size: formatSize(usage.bytes) }) : "…"}</p>
          </div>
          <button title={t("account.signOut")} aria-label={t("account.signOut")} onClick={onSignOut} className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-s3 hover:text-fg">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ dest, folder, icon, label, active, badge }: { dest: Dest; folder?: number; icon: React.ReactNode; label: string; active: boolean; badge?: number }) {
  const { over, handlers } = useDrop(dest === "files" ? (folder ?? 0) : null);
  return (
    <button
      {...handlers}
      onClick={() => (dest === "files" ? nav.openFolder(folder ?? 0) : nav.go({ dest }))}
      className={`relative flex h-[34px] items-center gap-3 rounded-lg px-2.5 text-[14px] font-medium transition-colors duration-[120ms] [&>svg]:size-[18px] ${
        over ? "bg-brand-soft ring-1 ring-brand" : active ? "bg-brand-soft text-fg [&>svg]:text-brand" : "text-fg-2 hover:bg-s3 hover:text-fg"
      }`}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />}
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge && <span className="rounded-full bg-info-soft px-1.5 text-[11px] font-semibold text-info tabular">{badge}</span>}
    </button>
  );
}
