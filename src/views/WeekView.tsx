import type { Nav } from "../App";
import { SessionBody, useTemplates } from "../components/common";
import { isCycling } from "../lib/activities";
import { addDays, dayLabel, ddmm, isoWeek, mondayOf, todayISO, weekday } from "../lib/dates";
import { EXAMPLE_PROGRAM } from "../lib/program";
import { hasTraining, isEmpty, sessionsBetween } from "../lib/sessions";
import { type Data, update } from "../lib/store";
import { useState } from "react";

export default function WeekView({ data, nav }: { data: Data; nav: Nav }) {
  const today = todayISO();
  const [monday, setMonday] = useState(mondayOf(today));
  const { templates } = useTemplates(data);
  const sunday = addDays(monday, 6);
  const sessions = sessionsBetween(data, monday, sunday).filter((s) => !isEmpty(s) || s.status === "live");

  const training = sessions.filter(hasTraining).length;
  const acts = sessions.flatMap((s) => s.activities);
  const km = (pred: (t: string) => boolean) => acts.filter((a) => pred(a.type)).reduce((n, a) => n + (a.distanceKm ?? 0), 0);
  const bike = km(isCycling);
  const run = km((t) => t === "Running");
  const planned = templates.filter((t) => t.weekday !== null).length;

  if (!data.sessions.length && !data.programText.trim()) {
    return (
      <div className="stack">
        <section className="card">
          <h2 className="h2">Pour commencer</h2>
          <p>Le carnet est vide. Trois façons de le remplir :</p>
          <ol className="steps">
            <li>Écrire ton programme : chaque jour devient un gabarit de séance avec objectifs et repos.</li>
            <li>Importer tes séances passées en collant tes notes telles quelles.</li>
            <li>Démarrer une séance libre et écrire au fil de l'eau.</li>
          </ol>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => nav.go("outils", { section: "programme" })}>Écrire mon programme</button>
            <button type="button" className="btn" onClick={() => nav.go("outils", { section: "import" })}>Importer des séances</button>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => nav.startSession(today, null)}>Séance libre</button>
            <button type="button" className="btn ghost" onClick={() => update((d) => { d.programText = EXAMPLE_PROGRAM; })}>Charger un programme d'exemple</button>
          </div>
        </section>
        <p className="small">Les données restent sur cet appareil. Pense à exporter une sauvegarde de temps en temps (Outils → Sauvegarde).</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="weeknav">
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente">‹</button>
        <div className="weeknav-label">
          <b>Semaine du {ddmm(monday)}</b>
          <span className="mono small">S{isoWeek(monday)}</span>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante">›</button>
      </div>
      {monday !== mondayOf(today) && (
        <button type="button" className="btn sm ghost center" onClick={() => setMonday(mondayOf(today))}>Revenir à cette semaine</button>
      )}

      <div className="stats">
        <div className="stat"><b>{training}{planned ? <span className="of"> / {planned}</span> : null}</b><span>séances</span></div>
        <div className="stat"><b>{acts.length}</b><span>activités</span></div>
        <div className="stat"><b>{bike ? Math.round(bike) : "–"}<span className="of"> km</span></b><span>vélo</span></div>
        <div className="stat"><b>{run ? run.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "–"}<span className="of"> km</span></b><span>course</span></div>
      </div>

      <button type="button" className="btn primary" onClick={() => nav.openActivity(today >= monday && today <= sunday ? today : monday)}>Ajouter une activité</button>

      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => {
        const daySessions = sessions.filter((s) => s.date === date);
        const tpl = templates.find((t) => t.weekday === weekday(date)) ?? null;
        const isToday = date === today;
        const isPast = date < today;
        return (
          <article key={date} className={`card day ${isToday ? "today" : ""}`}>
            <div className="day-head">
              <span className="day-date">{dayLabel(date)}</span>
              <span className="day-title">{daySessions[0]?.title || tpl?.title || (isPast ? "" : "Libre")}</span>
              {daySessions.some((s) => s.status === "live") ? <span className="pill live">En cours</span>
                : daySessions.some(hasTraining) ? <span className="pill done">Fait</span>
                : daySessions.length ? <span className="pill done">Actif</span>
                : tpl && !isPast ? <span className="pill">Prévu</span> : null}
            </div>
            {daySessions.map((s) => (
              <div key={s.id} className="day-session">
                {daySessions.length > 1 && s.title && <div className="blk-label">{s.title}</div>}
                <SessionBody session={s} />
                <div className="row">
                  <button type="button" className="btn sm" onClick={() => nav.openSession(s.id)}>{s.status === "live" ? "Reprendre" : "Ouvrir"}</button>
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
                <button type="button" className="btn sm ghost" onClick={() => nav.startSession(date, null)}>Autre séance</button>
              ) : (
                <button type="button" className="btn sm" onClick={() => nav.startSession(date, tpl)}>
                  {tpl ? (isPast ? "Saisir" : "Démarrer") : "Séance libre"}
                </button>
              ))}
              <button type="button" className="btn sm ghost" onClick={() => nav.openActivity(date)}>+ Activité</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
