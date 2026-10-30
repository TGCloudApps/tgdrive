import { AppLogo } from "@tgcloud/ui/ui/AppLogo";
import { useVaultPermission } from "@tgcloud/ui/core/vaultPermissions";
import { VaultPermissionNotice } from "@tgcloud/ui/ui/VaultPermissionNotice";
import { currentVault } from "@tgcloud/ui/core/vault";
/**
 * Import from TGPhotos: choose the vault and what to bring (everything or one album)
 * into the current folder. The files are forwarded between the channels (nothing is
 * downloaded again).
 */
import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { formatSize } from "@tgcloud/ui/core/format";
import { importSources, runImport, type ForeignVault } from "@tgcloud/ui/core/importer";
import { errText, invoke } from "@tgcloud/ui/core/server";
import { api } from "../core/api";
import { nav } from "../core/nav";
import { t } from "../i18n";
import { t as tc } from "@tgcloud/ui/i18n/ui";

type Media = { uid: string; name: string; mime: string; size: number; taken: number; duration: number | null; albums: string[] };
type Album = { uid: string; name: string; count: number };
type Library = { media: Media[]; albums: Album[] };
type Report = { imported: number; failed: number };

export function ImportView({ touch, parent }: { touch: boolean; parent: number }) {
  const mayWrite = useVaultPermission("write");
  const [vaults, setVaults] = useState<ForeignVault[] | null>(null);
  const [vault, setVault] = useState<ForeignVault | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState("");
  /** "" = all media; otherwise the album uid. */
  const [pick, setPick] = useState("");
  const [folder, setFolder] = useState(true);

  useEffect(() => {
    importSources()
      .then((v) => {
        setVaults(v);
        if (v.length === 1) setVault(v[0]);
      })
      .catch((e) => setError(errText(e)));
  }, []);
  useEffect(() => {
    if (!vault) return;
    setLib(null);
    invoke<Library>("import_browse", { vault: vault.id, fresh: false })
      .then(setLib)
      .catch((e) => setError(errText(e)));
  }, [vault]);

  const text = touch ? "text-[15px]" : "text-[14px]";
  const row = touch ? "min-h-14 px-5" : "min-h-11 px-3 rounded-lg";

  if (error) return <p className={`px-5 py-6 text-danger ${text}`}>{error}</p>;
  if (!vaults) return <Loading touch={touch} text={t("import.searching")} />;
  if (!vaults.length) return <p className={`px-5 py-6 text-fg-2 ${text}`}>{t("import.none")}</p>;
  if (!vault)
    return (
      <div className="pb-2">
        {vaults.map((v) => (
          <button key={v.id} onClick={() => setVault(v)} className={`flex w-full items-center gap-3 text-left ${row} ${touch ? "active:bg-s4" : "hover:bg-s3"}`}>
            <AppLogo id="tgphotos" size={28} className="shrink-0 text-brand" />
            <span className={`flex-1 truncate font-medium ${text}`}>{v.name}</span>
            <ChevronRight size={18} className="text-fg-3" />
          </button>
        ))}
      </div>
    );
  if (!lib) return <Loading touch={touch} text={t("import.reading", { name: vault.name })} />;

  const chosen = pick ? lib.media.filter((m) => m.albums.includes(pick)) : lib.media;
  const bytes = chosen.reduce((s, m) => s + m.size, 0);
  const albumName = lib.albums.find((a) => a.uid === pick)?.name;
  const options: { uid: string; label: string; count: number }[] = [
    { uid: "", label: t("import.all"), count: lib.media.length },
    ...lib.albums.map((a) => ({ uid: a.uid, label: a.name, count: a.count })),
  ];

  const start = () => {
    if (!mayWrite) return;
    const uids = chosen.map((m) => m.uid);
    const name = albumName ?? vault.name;
    const v = vault;
    nav.closeThen(
      () =>
        void runImport<Report>("TGPhotos", async () => {
          const target = folder ? (await api.mkdir(parent, name)).id : parent;
          return invoke<Report>("import_run", { vault: v.id, uids, parent: target });
        }).catch(() => {}),
    );
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 space-y-2 rounded-xl border border-hairline bg-s2 p-4">
        <p className="text-sm text-fg-2">{tc("import.flowSource", { name: vault.name })}</p>
        <p className="font-semibold">{tc("import.flowTarget", { name: currentVault()?.name ?? "" })}</p>
        <button type="button" onClick={() => { setVault(null); setError(""); }} className="min-h-10 rounded-lg px-3 font-semibold text-accent hover:bg-s3">{tc("import.changeSource")}</button>
      </div>
      <div className={`min-h-0 overflow-y-auto ${touch ? "max-h-[48vh]" : "max-h-[50vh]"}`}>
        {options.map((o) => (
          <button key={o.uid || "all"} onClick={() => setPick(o.uid)} className={`flex w-full items-center gap-3 text-left ${row} ${touch ? "active:bg-s4" : "hover:bg-s3"}`}>
            <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${pick === o.uid ? "border-brand bg-brand text-white" : "border-fg-3 text-transparent"}`}>
              <Check size={12} strokeWidth={3} />
            </span>
            <span className={`min-w-0 flex-1 truncate ${text} ${o.uid ? "" : "font-semibold"}`}>{o.label}</span>
            <span className="text-[12px] text-fg-3 tabular">{o.count}</span>
          </button>
        ))}
      </div>
      <div className={`pt-4 ${touch ? "px-5 pb-2" : ""}`}>
        <button onClick={() => setFolder((f) => !f)} className={`flex items-center gap-2 text-fg-2 ${touch ? "text-[14px]" : "text-[13px]"}`}>
          <span className={`grid size-5 place-items-center rounded-md border-2 ${folder ? "border-brand bg-brand text-white" : "border-fg-3 text-transparent"}`}>
            <Check size={12} strokeWidth={3} />
          </span>
          {t("import.createFolder", { name: albumName ?? vault.name })}
        </button>
        <VaultPermissionNotice />
        <button
          disabled={!chosen.length || !mayWrite}
          onClick={start}
          className={`step mt-4 w-full rounded-xl bg-brand font-semibold text-white disabled:bg-s3 disabled:text-fg-off disabled:shadow-none ${touch ? "h-12 text-[15px]" : "h-9 text-[14px]"}`}
        >
          {t("import.submit", { n: chosen.length })}
          {bytes > 0 && ` · ${formatSize(bytes)}`}
        </button>
      </div>
    </div>
  );
}

function Loading({ touch, text }: { touch: boolean; text: string }) {
  return (
    <p className={`flex items-center gap-2 px-5 py-6 text-fg-2 ${touch ? "text-[14px]" : "text-[13px]"}`}>
      <Loader2 size={16} className="animate-spin" /> {text}
    </p>
  );
}
