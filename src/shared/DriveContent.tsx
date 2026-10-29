import { Button } from "@tgcloud/ui/desktop/ui";
import { EmptyState, ErrorState, SkeletonRows } from "@tgcloud/ui/ui/States";
import { TransfersView } from "@tgcloud/ui/ui/Transfers";
import { UpdateBanner } from "@tgcloud/ui/ui/Update";
import { Clock, FolderOpen, Search, Trash2, Upload } from "lucide-react";
import type { Node } from "../core/api";
import { useFolder, useRecent, useSearch, useTrash } from "../core/data";
import { useRoute } from "../core/nav";
import { FileView } from "../desktop/FileTable";
import { useDrop } from "../desktop/dnd";
import { useDesk } from "../desktop/state";
import { t } from "../i18n";

export function DriveContent() {
  const route = useRoute();
  const { over, handlers } = useDrop(route.dest === "files" ? route.folder : null);
  return (
    <main {...handlers} className={`relative min-w-0 flex-1 overflow-y-auto px-4 ${over ? "bg-brand-soft/40" : ""}`}>
      {route.dest === "files" && route.folder === 0 && (
        <div className="px-6 pt-3 empty:hidden">
          <UpdateBanner touch={false} />
        </div>
      )}
      {route.dest === "files" && <FolderPane id={route.folder} />}
      {route.dest === "recent" && <RecentPane />}
      {route.dest === "trash" && <TrashPane />}
      {route.dest === "search" && <SearchPane text={route.query} />}
      {route.dest === "transfers" && <TransfersView touch={false} />}
      {over && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-2xl border-2 border-dashed border-brand text-[14px] font-semibold text-fg">
          {t("drop")}
        </div>
      )}
    </main>
  );
}

type Q = { data?: Node[]; isLoading: boolean; error: unknown; refetch: () => void };

function Pane({ q, empty, sortable = true }: { q: Q; empty: React.ReactNode; sortable?: boolean }) {
  if (q.isLoading) return <SkeletonRows rows={10} height={36} />;
  if (q.error) return <ErrorState error={q.error} retry={q.refetch} />;
  if (!q.data?.length) return <>{empty}</>;
  return <FileView nodes={q.data} sortable={sortable} />;
}

function FolderPane({ id }: { id: number }) {
  return (
    <Pane
      q={useFolder(id)}
      empty={
        <EmptyState
          icon={FolderOpen}
          title={id === 0 ? t("empty.drive") : t("empty.folder")}
          text={t("empty.deskHint")}
          action={
            <Button capability="write" variant="primary" onClick={() => useDesk.getState().pickFiles()}>
              <Upload /> {t("act.uploadFiles")}
            </Button>
          }
        />
      }
    />
  );
}

const RecentPane = () => (
  <Pane q={useRecent()} sortable={false} empty={<EmptyState icon={Clock} title={t("empty.recent")} text={t("empty.recentText")} />} />
);

const TrashPane = () => (
  <Pane q={useTrash()} empty={<EmptyState icon={Trash2} title={t("empty.trash")} text={t("empty.trashText")} />} />
);

function SearchPane({ text }: { text: string }) {
  const q = useSearch(text);
  return (
    <Pane
      q={{ ...q, isLoading: q.isLoading && q.fetchStatus !== "idle" }}
      empty={<EmptyState icon={Search} title={t("search.none")} text={t("search.noneText", { text })} />}
    />
  );
}

