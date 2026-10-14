import { useState } from "react";
import type { Nav } from "../App";
import { dayLabel } from "../lib/dates";
import { toast } from "../lib/device";
import { useT } from "../lib/i18n";
import type { Template } from "../lib/program";
import { movePlan, removePlan } from "../lib/sessions";
import { type PlanItem, update } from "../lib/store";

/** Un bloc planifié : on le consulte, on le démarre, on le déplace ou on le retire. */
export default function PlanCard({ item, template, nav, compact = false }: { item: PlanItem; template: Template | undefined; nav: Nav; compact?: boolean }) {
  const t = useT();
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState(item.date);
  const title = template?.title ?? item.title;
  const core = template?.blocks.filter((b) => b.tag !== "bonus") ?? [];
  const summary = core.map((b) => b.exos.map((e) => e.name).join(" / ")).join(" · ");

  return (
    <div className={`plan-card ${compact ? "compact" : ""}`}>
      <button
        type="button"
        className="plan-main"
        disabled={!template}
        onClick={() => template && nav.preview({ templateId: template.id, date: item.date, planId: item.id })}
      >
        <b>{title}</b>
        {!compact && (template
          ? summary && summary !== title && <span className="small">{summary}</span>
          : <span className="small">{t.plan.missing}</span>)}
      </button>
      {moving ? (
        <div className="row nowrap">
          <input
            className="field"
            type="date"
            id={`move-${item.id}`}
            aria-label={t.plan.moveLabel(title)}
            value={moveDate}
            onChange={(e) => e.target.value && setMoveDate(e.target.value)}
          />
          <button
            type="button"
            className="btn sm primary"
            disabled={moveDate === item.date}
            onClick={() => {
              update((x) => movePlan(x, item.id, moveDate));
              setMoving(false);
              toast(t.plan.moved(dayLabel(moveDate, t.lang)));
            }}
          >OK</button>
          <button type="button" className="btn sm ghost" onClick={() => setMoving(false)}>{t.common.cancel}</button>
        </div>
      ) : (
        <div className="row">
          {template && <button type="button" className="btn sm primary" onClick={() => nav.startSession(item.date, template, item.id)}>{t.plan.start}</button>}
          <button type="button" className="btn sm" onClick={() => { setMoveDate(item.date); setMoving(true); }}>{t.plan.move}</button>
          <button type="button" className="btn sm ghost" onClick={() => { update((x) => removePlan(x, item.id)); toast(t.plan.removed); }}>{t.plan.remove}</button>
        </div>
      )}
    </div>
  );
}
