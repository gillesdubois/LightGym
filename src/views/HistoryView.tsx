import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { Chip, SessionBody } from "../components/common";
import { isCycling } from "../lib/activities";
import { addDays, dayLabel, ddmm, ddmmyyyy, fromISO, MONTHS, pad, todayISO, toISO, weekday } from "../lib/dates";
import { bestOf } from "../lib/parse";
import { type ExerciseIndex, hasTraining, indexExercises, isEmpty } from "../lib/sessions";
import type { Data, Session } from "../lib/store";

export default function HistoryView({ data, nav, initialDate }: { data: Data; nav: Nav; initialDate: string | null }) {
  const [mode, setMode] = useState<"cal" | "ex">("cal");
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Affichage de l'historique">
        <button type="button" role="tab" aria-selected={mode === "cal"} onClick={() => setMode("cal")}>Calendrier</button>
        <button type="button" role="tab" aria-selected={mode === "ex"} onClick={() => setMode("ex")}>Exercices</button>
      </div>
      {mode === "cal" ? <Calendar data={data} nav={nav} initialDate={initialDate} /> : <Exercises data={data} />}
    </div>
  );
}

/* ---------- Calendrier ---------- */

function Calendar({ data, nav, initialDate }: { data: Data; nav: Nav; initialDate: string | null }) {
  const today = todayISO();
  const [selected, setSelected] = useState(initialDate ?? today);
  const [month, setMonth] = useState(() => selected.slice(0, 7));
  const first = `${month}-01`;
  const firstDate = fromISO(first);
  const daysInMonth = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0).getDate();
  const last = `${month}-${pad(daysInMonth)}`;

  const byDate = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of data.sessions) {
      if (isEmpty(s) && s.status !== "live") continue;
      m.set(s.date, [...(m.get(s.date) ?? []), s]);
    }
    return m;
  }, [data.sessions]);

  const monthSessions = [...byDate.entries()].filter(([d]) => d >= first && d <= last).flatMap(([, s]) => s);
  const training = monthSessions.filter(hasTraining).length;
  const acts = monthSessions.flatMap((s) => s.activities);
  const bike = acts.filter((a) => isCycling(a.type)).reduce((n, a) => n + (a.distanceKm ?? 0), 0);
  const run = acts.filter((a) => a.type === "Running").reduce((n, a) => n + (a.distanceKm ?? 0), 0);
  const activeDays = new Set(monthSessions.map((s) => s.date)).size;

  const shiftMonth = (n: number) => {
    const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + n, 1);
    setMonth(toISO(d).slice(0, 7));
  };

  const lead = weekday(first);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const dayList = byDate.get(selected) ?? [];

  return (
    <>
      <div className="weeknav">
        <button type="button" className="btn sm ghost" onClick={() => shiftMonth(-1)} aria-label="Mois précédent">‹</button>
        <div className="weeknav-label"><b className="cap">{MONTHS[firstDate.getMonth()]} {firstDate.getFullYear()}</b></div>
        <button type="button" className="btn sm ghost" onClick={() => shiftMonth(1)} aria-label="Mois suivant">›</button>
      </div>

      <div className="stats">
        <div className="stat"><b>{training}</b><span>séances</span></div>
        <div className="stat"><b>{activeDays}<span className="of"> / {daysInMonth}</span></b><span>jours actifs</span></div>
        <div className="stat"><b>{bike ? Math.round(bike) : "–"}<span className="of"> km</span></b><span>vélo</span></div>
        <div className="stat"><b>{run ? run.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "–"}<span className="of"> km</span></b><span>course</span></div>
      </div>

      <div className="card cal">
        <div className="cal-grid cal-head" aria-hidden="true">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="cal-grid" role="grid" aria-label="Jours du mois">
          {cells.map((date, i) => {
            if (!date) return <span key={i} />;
            const list = byDate.get(date) ?? [];
            const train = list.some(hasTraining);
            const act = list.some((s) => s.activities.length);
            return (
              <button
                key={date}
                type="button"
                className={`cal-day ${date === selected ? "sel" : ""} ${date === today ? "today" : ""} ${list.length ? "has" : ""}`}
                aria-pressed={date === selected}
                aria-label={`${dayLabel(date)}${train ? ", séance" : ""}${act ? ", activité" : ""}`}
                onClick={() => setSelected(date)}
              >
                <span className="num">{fromISO(date).getDate()}</span>
                <span className="marks">
                  {train && <i className="m-train" />}
                  {act && <i className="m-act" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="legend small"><span><i className="m-train" /> séance</span><span><i className="m-act" /> activité</span></div>
      </div>

      <section className="card">
        <div className="row between">
          <b>{dayLabel(selected)}</b>
          <span className="row">
            <button type="button" className="btn sm" onClick={() => nav.startSession(selected, null)}>Saisir</button>
            <button type="button" className="btn sm ghost" onClick={() => nav.openActivity(selected)}>+ Activité</button>
          </span>
        </div>
        {dayList.length ? dayList.map((s) => (
          <div key={s.id} className="day-session">
            {s.title && <div className="blk-label">{s.title}</div>}
            <SessionBody session={s} />
            <div className="row"><button type="button" className="btn sm" onClick={() => nav.openSession(s.id)}>Ouvrir</button></div>
          </div>
        )) : <span className="small">Rien d'enregistré ce jour-là.</span>}
      </section>
    </>
  );
}

/* ---------- Exercices ---------- */

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 120, h = 34, padY = 4;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 6) + 3, h - padY - ((p - min) / span) * (h - padY * 2)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={`${d} L${lx.toFixed(1)},${h} L3,${h} Z`} className="spark-area" />
      <path d={d} className="spark-line" fill="none" />
      <circle cx={lx} cy={ly} r="3" className="spark-dot" />
    </svg>
  );
}

function Exercises({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const index = useMemo(() => indexExercises(data.sessions), [data.sessions]);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = index.filter((i) => norm(i.name).includes(norm(q.trim())));
  const current = open ? index.find((i) => i.key === open) : null;

  if (current) return <ExerciseDetail item={current} onBack={() => setOpen(null)} />;

  return (
    <>
      <input className="field" id="ex-search" type="search" placeholder="Chercher un exercice" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher un exercice" />
      {!index.length && <p className="small">Les exercices apparaissent ici dès qu'une séance contient des séries.</p>}
      <div className="ex-list">
        {list.map((i) => {
          const lastE = i.entries[i.entries.length - 1];
          const pts = i.entries.map((e) => bestOf(e.values)).filter((x): x is number => x !== null).slice(-10);
          return (
            <button key={i.key} type="button" className="ex-row" onClick={() => setOpen(i.key)}>
              <span className="ex-row-main">
                <b>{i.name}</b>
                <span className="small mono">{i.entries.length} séance{i.entries.length > 1 ? "s" : ""} · {ddmm(lastE.date)} · {lastE.values.map((v) => v.txt).join(",")}</span>
              </span>
              <Sparkline points={pts} />
            </button>
          );
        })}
      </div>
    </>
  );
}

function ExerciseDetail({ item, onBack }: { item: ExerciseIndex; onBack: () => void }) {
  const entries = [...item.entries].reverse();
  const pts = item.entries.map((e) => bestOf(e.values)).filter((x): x is number => x !== null);
  return (
    <>
      <button type="button" className="btn sm ghost start" onClick={onBack}>‹ Tous les exercices</button>
      <section className="card">
        <h2 className="h2">{item.name}</h2>
        <div className="row between">
          <span className="small">{item.entries.length} séances depuis le {ddmmyyyy(item.entries[0].date)}</span>
          <Sparkline points={pts.slice(-20)} />
        </div>
        {pts.length > 0 && <span className="small">Meilleure série : <b className="mono">{Math.max(...pts)}</b> · moyenne des meilleures : <span className="mono">{(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1)}</span></span>}
      </section>
      <div className="card hist">
        {entries.map((e, i) => (
          <div key={i} className="hist-row">
            <span className="mono hist-date">{ddmmyyyy(e.date)}</span>
            <div className="hist-body">
              <span className="ex-meta">{[e.load, e.sets ? `${e.sets}x` : null, e.targetTxt ? `[${e.targetTxt}]` : null].filter(Boolean).join(" ") || "—"}</span>
              <div className="chips">{e.values.map((v, j) => <Chip key={j} v={v} />)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
