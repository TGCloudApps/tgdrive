import { canUseVault } from "@tgcloud/ui/core/vaultPermissions";
import { transfers } from "@tgcloud/ui/core/transfers";
import { t } from "../i18n";
import { targetFolder } from "../desktop/state";

export async function pickNative(directory: boolean) {
  if (!canUseVault("write")) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: !directory, directory, title: directory ? t("act.uploadFolder") : t("act.uploadFiles") });
  if (!picked) return;
  const paths = Array.isArray(picked) ? picked : [picked];
  void transfers.uploadPaths(paths, targetFolder());
}

