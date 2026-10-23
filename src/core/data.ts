/** Queries (React Query over the core commands) and file actions. */
import { QueryClient, useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { refreshSoon, setRefresher } from "@tgcloud/ui/core/refresh";
import { api, errText, type Node } from "./api";
import { notify, notifyError, useSelection } from "./store";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/** The index is local (SQLite): after any mutation, reload everything. */
export const refresh = () => queryClient.invalidateQueries();
setRefresher(refresh);
export { refreshSoon };

export const useFolder = (id: number) => useQuery({ queryKey: ["list", id], queryFn: () => api.list(id) });
export const usePath = (id: number) =>
  useQuery({ queryKey: ["path", id], queryFn: () => (id ? api.path(id) : Promise.resolve([])) });
export const useRecent = () => useQuery({ queryKey: ["recent"], queryFn: api.recent });
export const useTrash = () => useQuery({ queryKey: ["trash"], queryFn: api.trashList });
export const useSearch = (text: string) =>
  useQuery({ queryKey: ["search", text], queryFn: () => api.search(text), enabled: text.trim().length > 0 });
export const useFolders = () => useQuery({ queryKey: ["folders"], queryFn: api.folders });
export const useUsage = () => useQuery({ queryKey: ["usage"], queryFn: api.usage });

/** Finds a node already loaded in any query (for layers that only keep an id). */
export function findNode(id: number): Node | undefined {
  for (const [, data] of queryClient.getQueriesData<Node[]>({})) {
    const hit = Array.isArray(data) ? data.find((n) => n?.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

async function run<T>(p: Promise<T>) {
  try {
    const r = await p;
    await refresh();
    return r;
  } catch (e) {
    notifyError(e);
    throw e;
  }
}

export const actions = {
  mkdir: (parent: number, name: string) => run(api.mkdir(parent, name)),
  rename: (id: number, name: string) => run(api.rename(id, name)),

  async trash(ids: number[]) {
    await run(api.trash(ids));
    useSelection.getState().clear();
    notify({
      text: t("toast.trashed", { n: ids.length }),
      tone: "neutral",
      action: { label: t("toast.undo"), run: () => void run(api.restore(ids)) },
    });
  },

  async restore(ids: number[]) {
    await run(api.restore(ids));
    notify({ text: t("toast.restored", { n: ids.length }), tone: "success" });
  },

  async purge(ids: number[]) {
    await run(api.purge(ids));
    notify({ text: t("toast.purged", { n: ids.length }), tone: "neutral" });
  },

  async emptyTrash() {
    await run(api.emptyTrash());
    notify({ text: t("toast.emptied"), tone: "neutral" });
  },

  async move(ids: number[], parent: number, folderName: string) {
    await run(api.move(ids, parent));
    useSelection.getState().clear();
    notify({ text: t("toast.moved", { n: ids.length, to: folderName }), tone: "neutral" });
  },

  async copy(ids: number[], parent: number, folderName: string) {
    await run(api.copy(ids, parent));
    notify({ text: t("toast.copied", { n: ids.length, to: folderName }), tone: "neutral" });
  },

  /** "Save as": the system picks the destination; the manager downloads it. */
  async saveAs(node: Node) {
    let dest: string | null;
    try {
      dest = await save({ defaultPath: node.name, title: t("save.title") });
    } catch (e) {
      return notifyError(e);
    }
    if (!dest) return;
    try {
      await api.downloadTo(node.id, dest);
      notify({ text: t("toast.queued", { name: node.name }), tone: "info" });
    } catch (e) {
      notify({ text: ui("transfers.downloadError", { error: errText(e) }), tone: "danger" });
    }
  },
};
