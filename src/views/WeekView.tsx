import { useState } from "react";
import type { Nav } from "../App";
import { SessionBody, useTemplates } from "../components/common";
import { isCycling } from "../lib/activities";
import { addDays, dayLabel, ddmm, isoWeek, mondayOf, todayISO, weekday } from "../lib/dates";
import { useT } from "../lib/i18n";
import { EXAMPLE_PROGRAM } from "../lib/program";
import { hasTraining, isEmpty, sessionsBetween } from "../lib/sessions";
import { type Data, update } from "../lib/store";

export default function WeekView({ data, nav }: { data: Data; nav: Nav }) {
  const t = useT();
  const today = todayISO();
  const [monday, setMonday] = useState(mondayOf(today));
  const { templates } = useTemplates(data);
  const sunday = addDays(monday, 6);
  const sessions = sessionsBetween(data, monday, sunday).filter((s) => !isEmpty(s) || s.status === "live");

  const training = sessions.filter(hasTraining).length;
  const acts = sessions.flatMap((s) => s.activities);
  const km = (pred: (type: string) => boolean) => acts.filter((a) => pred(a.type)).reduce((n, a) => n + (a.distanceKm ?? 0), 0);
  const bike = km(isCycling);
  const run = km((type) => type === "run");
  const planned = templates.filter((x) => x.weekday !== null).length;

  if (!data.sessions.length && !data.programText.trim()) {
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

  return (
    <div className="stack">
      <div className="weeknav">
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, -7))} aria-label={t.common.prevWeek}>‹</button>
        <div className="weeknav-label">
          <b>{t.common.weekOf(ddmm(monday))}</b>
          <span className="mono small">{t.common.weekNum(isoWeek(monday))}</span>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, 7))} aria-label={t.common.nextWeek}>›</button>
      </div>
      {monday !== mondayOf(today) && (
        <button type="button" className="btn sm ghost center" onClick={() => setMonday(mondayOf(today))}>{t.week.backToThisWeek}</button>
      )}

      <div className="stats">
        <div className="stat"><b>{training}{planned ? <span className="of"> / {planned}</span> : null}</b><span>{t.week.statSessions}</span></div>
        <div className="stat"><b>{acts.length}</b><span>{t.week.statActivities}</span></div>
        <div className="stat"><b>{bike ? Math.round(bike) : "–"}<span className="of"> km</span></b><span>{t.week.statBike}</span></div>
        <div className="stat"><b>{run ? run.toLocaleString(t.locale, { maximumFractionDigits: 1 }) : "–"}<span className="of"> km</span></b><span>{t.week.statRun}</span></div>
      </div>

      <button type="button" className="btn primary" onClick={() => nav.openActivity(today >= monday && today <= sunday ? today : monday)}>{t.week.addActivity}</button>

      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => {
        const daySessions = sessions.filter((s) => s.date === date);
        const tpl = templates.find((x) => x.weekday === weekday(date)) ?? null;
        const isToday = date === today;
        const isPast = date < today;
        return (
          <article key={date} className={`card day ${isToday ? "today" : ""}`}>
            <div className="day-head">
              <span className="day-date">{dayLabel(date, t.lang)}</span>
              <span className="day-title">{daySessions[0]?.title || tpl?.title || (isPast ? "" : t.week.free)}</span>
              {daySessions.some((s) => s.status === "live") ? <span className="pill live">{t.week.live}</span>
                : daySessions.some(hasTraining) ? <span className="pill done">{t.week.done}</span>
                : daySessions.length ? <span className="pill done">{t.week.active}</span>
                : tpl && !isPast ? <span className="pill">{t.week.planned}</span> : null}
            </div>
            {daySessions.map((s) => (
              <div key={s.id} className="day-session">
                {daySessions.length > 1 && s.title && <div className="blk-label">{s.title}</div>}
                <SessionBody session={s} />
                <div className="row">
                  <button type="button" className="btn sm" onClick={() => nav.openSession(s.id)}>{s.status === "live" ? t.week.resume : t.week.open}</button>
                </div>
              </div>
            ))}
            {!daySessions.some(hasTraining) && tpl && !isPast && (
              <div className="plan">
                {tpl.blocks.filter((b) => b.tag !== "bonus").map((b, i) => <span key={i}>{b.exos.map((e) => e.name).join(" / ")}</span>)}
              </div>
            )}
            <div className="row">
              {!daySessions.some((s) => s.status === "live") && (daySessions.some(hasTraining) ? (
                <button type="button" className="btn sm ghost" onClick={() => nav.startSession(date, null)}>{t.week.another}</button>
              ) : (
                <button type="button" className="btn sm" onClick={() => nav.startSession(date, tpl)}>
                  {tpl ? (isPast ? t.week.log : t.week.start) : t.week.freeSession}
                </button>
              ))}
              <button type="button" className="btn sm ghost" onClick={() => nav.openActivity(date)}>{t.week.plusActivity}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
