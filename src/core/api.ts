/** TGDrive commands: the shared ones (`base`) plus the file tree. */
import { base } from "@tgcloud/ui/core/base";
import { invoke } from "@tgcloud/ui/core/server";

export { errText, fileUrl, getPort, setPort } from "@tgcloud/ui/core/server";
export type { Transfer, TransferState, Status, SyncReport, Vault } from "@tgcloud/ui/core/base";

export type Node = {
  id: number;
  parent_id: number;
  name: string;
  is_dir: boolean;
  size: number;
  mime: string;
  created_at: number;
  modified_at: number;
  trashed_at: number | null;
  /** Has a generated thumbnail (served at /thumb/<id>). */
  thumb: boolean;
  /** Duration in seconds (video/audio). */
  duration: number | null;
};

export type Usage = { files: number; bytes: number };

export const api = {
  ...base,
  list: (parent: number) => invoke<Node[]>("list", { parent }),
  recent: () => invoke<Node[]>("recent"),
  trashList: () => invoke<Node[]>("trash_list"),
  search: (text: string) => invoke<Node[]>("search", { text }),
  folders: () => invoke<Node[]>("folders"),
  path: (id: number) => invoke<Node[]>("path", { id }),
  usage: () => invoke<Usage>("usage"),

  mkdir: (parent: number, name: string) => invoke<Node>("mkdir", { parent, name }),
  rename: (id: number, name: string) => invoke<void>("rename", { id, name }),
  move: (ids: number[], parent: number) => invoke<void>("move_nodes", { ids, parent }),
  copy: (ids: number[], parent: number) => invoke<void>("copy_nodes", { ids, parent }),
  trash: (ids: number[]) => invoke<void>("trash", { ids }),
  restore: (ids: number[]) => invoke<void>("restore", { ids }),
  purge: (ids: number[]) => invoke<void>("purge", { ids }),
  emptyTrash: () => invoke<void>("empty_trash"),
};
