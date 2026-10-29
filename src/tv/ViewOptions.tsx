import type { ReactNode } from "react";
import { ArrowDownAZ, ArrowUp, ArrowDown, Check, LayoutGrid, List, Info } from "lucide-react";
import { useView } from "../core/store";
import { useDesk } from "../desktop/state";
import { t } from "../i18n";
import { t as ui } from "@tgcloud/ui/i18n/ui";

function Choice({ selected, icon, children, onClick }: { selected: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return <button role="radio" aria-checked={selected} className="tv-choice" onClick={onClick}>{icon}<span>{children}</span>{selected && <Check className="tv-choice-check" />}</button>;
}

export function ViewOptions() {
  const view = useView();
  const sorts = [['name', ui("common.name")], ['modified', t("sort.modified")], ['size', t("sort.size")], ['kind', t("sort.kind")]] as const;
  return <div className="tv-library-tools">
    <p className="tv-sort-summary">{sorts.find(([key]) => key === view.sort)?.[1]} · {t(view.asc ? "sort.asc" : "sort.desc")}</p>
    <h3 className="tv-menu-section-title">{t("sort.by")}</h3>
    <div role="radiogroup" aria-label={t("sort.by")}>{sorts.map(([key,label]) => <Choice key={key} selected={view.sort === key} icon={<ArrowDownAZ />} onClick={() => view.set({sort:key})}>{label}</Choice>)}</div>
    <hr />
    <h3 className="tv-menu-section-title">{t("sort.direction")}</h3>
    <div role="radiogroup" aria-label={t("sort.direction")}>
      <Choice selected={view.asc} icon={<ArrowUp />} onClick={() => view.set({asc:true})}>{t("sort.asc")}</Choice>
      <Choice selected={!view.asc} icon={<ArrowDown />} onClick={() => view.set({asc:false})}>{t("sort.desc")}</Choice>
    </div>
    <hr />
    <h3 className="tv-menu-section-title">{t("act.view")}</h3>
    <div role="radiogroup" aria-label={t("act.view")}>
      <Choice selected={view.layout === "list"} icon={<List />} onClick={() => view.set({layout:"list"})}>{t("view.list")}</Choice>
      <Choice selected={view.layout === "grid"} icon={<LayoutGrid />} onClick={() => view.set({layout:"grid"})}>{t("view.grid")}</Choice>
    </div>
    <button onClick={() => useDesk.setState({details:true})}><Info />{t("act.details")}</button>
  </div>;
}
