import type { Nav } from "../App";
import { SessionBody, useTemplates } from "../components/common";
import PlanCard from "../components/PlanCard";
import { isCycling } from "../lib/activities";
import { addDays, dayLabel, mondayOf, todayISO } from "../lib/dates";
import { toast } from "../lib/device";
import { useT } from "../lib/i18n";
import { EXAMPLE_PROGRAM } from "../lib/program";
import { fillWeekFromProgram, hasTraining, isEmpty, pendingPlanOn, sessionsBetween } from "../lib/sessions";
import { type Data, update } from "../lib/store";

export default function TodayView({ data, nav }: { data: Data; nav: Nav }) {
  const t = useT();
  const today = todayISO();
  const monday = mondayOf(today);
  const { templates } = useTemplates(data);
  const byId = new Map(templates.map((x) => [x.id, x]));

  if (!data.sessions.length && !data.programText.trim() && !data.plan.length) {
    return (
      <div className="stack">
        <section className="card">
          <h2 className="h2">{t.week.startTitle}</h2>
          <p>{t.week.startIntro}</p>
          <ol className="steps">
            {t.week.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => nav.go("outils", { section: "programme" })}>{t.week.writeProgram}</button>
            <button type="button" className="btn" onClick={() => nav.go("outils", { section: "import" })}>{t.week.importSessions}</button>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => nav.startSession(today, null)}>{t.week.freeSession}</button>
            <button type="button" className="btn ghost" onClick={() => update((d) => { d.programText = EXAMPLE_PROGRAM[t.lang]; })}>{t.week.loadExample}</button>
          </div>
        </section>
        <p className="small">{t.week.localNote}</p>
      </div>
    );
  }

  const live = data.sessions.find((s) => s.status === "live") ?? null;
  const pending = pendingPlanOn(data, today);
  const doneToday = data.sessions.filter((s) => s.date === today && s.status !== "live" && !isEmpty(s));

  const weekSessions = sessionsBetween(data, monday, addDays(monday, 6));
  const acts = weekSessions.flatMap((s) => s.activities);
  const km = (pred: (type: string) => boolean) => acts.filter((a) => pred(a.type)).reduce((n, a) => n + (a.distanceKm ?? 0), 0);
  const fmtKm = (n: number) => (n ? n.toLocaleString(t.locale, { maximumFractionDigits: 1 }) : null);
  const weekLine = t.today.weekLine(weekSessions.filter(hasTraining).length, fmtKm(km(isCycling)), fmtKm(km((x) => x === "run")));

  const weekHasPlan = data.plan.some((p) => p.date >= monday && p.date <= addDays(monday, 6));
  const hasTypicalWeek = templates.some((x) => x.weekday !== null);

  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
    .flatMap((date) => pendingPlanOn(data, date).map((p) => ({ date, p })));

  return (
    <div className="stack">
      <p className="small mono">{weekLine}</p>

      {live && (
        <section className="card live-card">
          <div className="row between nowrap">
            <span>
              <span className="blk-label">{t.today.live}</span>
              <b className="block">{live.title || t.header.freeSession}</b>
            </span>
            <button type="button" className="btn primary" onClick={() => nav.openSession(live.id)}>{t.week.resume}</button>
          </div>
        </section>
      )}

      <section className="card">
        <span className="blk-label">{t.today.planned}</span>
        {pending.length
          ? pending.map((p) => <PlanCard key={p.id} item={p} template={byId.get(p.templateId)} nav={nav} />)
          : <span className="small">{t.today.nothingPlanned}</span>}
        <div className="row">
          <button type="button" className="btn sm" onClick={() => nav.openPlan(today)}>{t.today.planBlock}</button>
          <button type="button" className="btn sm ghost" onClick={() => nav.startSession(today, null)}>{t.today.freeSession}</button>
          <button type="button" className="btn sm ghost" onClick={() => nav.openActivity(today)}>{t.week.plusActivity}</button>
        </div>
      </section>

      {!weekHasPlan && hasTypicalWeek && (
        <section className="card inset">
          <p className="small">{t.today.fillWeekHelp}</p>
          <button
            type="button"
            className="btn start"
            onClick={() => {
              let n = 0;
              update((d) => { n = fillWeekFromProgram(d, monday, templates); });
              toast(t.today.filled(n));
            }}
          >{t.today.fillWeek}</button>
        </section>
      )}

      {doneToday.length > 0 && (
        <section className="card">
          <span className="blk-label">{t.today.done}</span>
          {doneToday.map((s) => (
            <div key={s.id} className="day-session">
              {s.title && <b>{s.title}</b>}
              <SessionBody session={s} />
              <div className="row"><button type="button" className="btn sm" onClick={() => nav.openSession(s.id)}>{t.week.open}</button></div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <span className="blk-label">{t.today.upcoming}</span>
        {upcoming.length ? (
          <div className="upcoming">
            {upcoming.map(({ date, p }) => {
              const tpl = byId.get(p.templateId);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="up-row"
                  disabled={!tpl}
                  onClick={() => tpl && nav.preview({ templateId: tpl.id, date, planId: p.id })}
                >
                  <span className="mono day-date">{dayLabel(date, t.lang)}</span>
                  <span className="up-title">{tpl?.title ?? p.title}</span>
                </button>
              );
            })}
          </div>
        ) : <span className="small">{t.today.noUpcoming}</span>}
      </section>
    </div>
  );
}
