import type { Node } from "../core/api";
import { Thumb } from "@tgcloud/ui/media/FileIcon";
import { DetailRows } from "../shared/Details";
import { t } from "../i18n";

/** Content only: the controller drawer owns its title, scrolling and back action. */
export function ControllerDetails({ node }: { node: Node | undefined }) {
  if (!node) return <p className="py-6 text-[18px] text-fg-2">{t("details.pick")}</p>;
  return <div className="min-w-0">
    <div className="surface aspect-[4/3] overflow-hidden rounded-xl bg-s2"><Thumb node={node} icon={72} /></div>
    <h3 className="my-6 text-[22px] font-semibold break-words text-fg">{node.name}</h3>
    <DetailRows node={node} controller />
  </div>;
}
