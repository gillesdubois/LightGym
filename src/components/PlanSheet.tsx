import { useEffect, useState } from "react";
import { DAYS, todayISO } from "../lib/dates";
import { toast } from "../lib/device";
import { useT } from "../lib/i18n";
import { addPlan, type PlanRepeat } from "../lib/sessions";
import { type Data, update } from "../lib/store";
import { useTemplates } from "./common";

/** Feuille « Planifier un bloc » : un bloc du programme, une date, une répétition éventuelle. */
export default function PlanSheet({ data, date, onClose }: { data: Data; date?: string; onClose: () => void }) {
  const t = useT();
  const { templates } = useTemplates(data);
  const [day, setDay] = useState(date ?? todayISO());
  const [repeat, setRepeat] = useState<PlanRepeat>("once");
  const [selected, setSelected] = useState<string | null>(templates[0]?.id ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = () => {
    const tpl = templates.find((x) => x.id === selected);
    if (!tpl) return;
    let n = 0;
    update((d) => { n = addPlan(d, day, tpl, repeat); });
    toast(t.plan.added(n));
    onClose();
  };

  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="plan-title">
        <div className="row between">
          <h3 id="plan-title">{t.plan.sheetTitle}</h3>
          <button type="button" className="btn sm ghost" onClick={onClose}>{t.common.close}</button>
        </div>
        {!templates.length ? (
          <p className="small">{t.plan.noTemplates}</p>
        ) : (
          <>
            <div className="tpl-list" role="radiogroup" aria-label={t.plan.sheetTitle}>
              {templates.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={selected === x.id} className="tpl" onClick={() => setSelected(x.id)}>
                  <span>
                    <b>{x.title}</b>
                    <span className="small">{x.blocks.map((b) => b.exos.map((e) => e.name).join(" / ")).join(" · ")}</span>
                  </span>
                  {x.weekday !== null && <span className="mono small">{DAYS[t.lang].short[x.weekday]}</span>}
                </button>
              ))}
            </div>
            <div className="grid2">
              <label className="lbl" htmlFor="plan-day">{t.plan.date}
                <input className="field" id="plan-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </label>
              <label className="lbl" htmlFor="plan-repeat">{t.plan.repeat}
                <select className="field" id="plan-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as PlanRepeat)}>
                  <option value="once">{t.plan.once}</option>
                  <option value="weekdays">{t.plan.weekdays}</option>
                  <option value="everyday">{t.plan.everyday}</option>
                </select>
              </label>
            </div>
            <button type="button" className="btn primary" disabled={!selected} onClick={add}>{t.plan.sheetTitle}</button>
          </>
        )}
      </div>
    </div>
  );
}
