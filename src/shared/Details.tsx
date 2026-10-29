import type { Node } from "../core/api";
import { t } from "../i18n";
import { fmtNumber } from "@tgcloud/ui/i18n";
import { formatFullDate, formatSize, kindLabel, kindOf } from "../core/format";

/** Detail rows of an item (desktop panel, lightbox and mobile sheet). */
export function DetailRows({ node, touch, controller }: { node: Node; touch?: boolean; controller?: boolean }) {
  const rows: [string, string][] = [
    [t("details.type"), node.is_dir ? kindLabel.folder : `${kindLabel[kindOf(node)]} · ${node.mime || t("details.unknown")}`],
    ...(node.is_dir ? [] : ([[t("details.size"), t("details.sizeBytes", { size: formatSize(node.size), bytes: fmtNumber(node.size) })]] as [string, string][])),
    [t("details.modified"), formatFullDate(node.modified_at)],
    [t("details.created"), formatFullDate(node.created_at)],
    ...(node.trashed_at ? ([[t("details.trashedSince"), formatFullDate(node.trashed_at)]] as [string, string][]) : []),
  ];
  return (
    <dl className={controller ? "space-y-5" : touch ? "" : "space-y-3"}>
      {rows.map(([k, v]) => (
        <div key={k} className={touch ? "border-b border-hairline py-3 last:border-0" : ""}>
          <dt className={`text-fg-3 ${controller ? "text-[16px]" : touch ? "text-[12px]" : "text-[13px]"}`}>{k}</dt>
          <dd className={`mt-0.5 text-fg tabular select-text break-words ${controller ? "text-[18px]" : touch ? "text-[14px]" : "text-[13px]"}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
