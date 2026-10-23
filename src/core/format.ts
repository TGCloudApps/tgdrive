import { kindLabel, kindOf } from "@tgcloud/ui/core/format";
import { compareNames } from "@tgcloud/ui/i18n";
import type { Node } from "./api";

export * from "@tgcloud/ui/core/format";

export function sortNodes(list: Node[], key: SortKey, asc: boolean) {
  const dir = asc ? 1 : -1;
  return [...list].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let c = 0;
    if (key === "name") c = compareNames(a.name, b.name);
    else if (key === "size") c = a.size - b.size;
    else if (key === "modified") c = a.modified_at - b.modified_at;
    else c = compareNames(kindLabel[kindOf(a)], kindLabel[kindOf(b)]);
    return c * dir || compareNames(a.name, b.name);
  });
}

export type SortKey = "name" | "size" | "modified" | "kind";
