import { useState } from "react";
import type { Nav } from "../App";
import { fmtClock, todayISO, dayLabel } from "../lib/dates";
import { keepScreenOn, toast, unlockAudio } from "../lib/device";
import { addActivityTo } from "../lib/sessions";
import { uid, update } from "../lib/store";
import {
  chrono, completedRounds, phaseLeft, PREP_SECONDS, PRESETS, presetTotal, resetChrono,
  selectPreset, stopwatchMs, toggleChrono, useTimers, type Preset,
} from "../lib/timers";

const R = 100;
const C = 2 * Math.PI * R;
const PHASE_LABEL: Record<string, string> = { prep: "PRÉPARATION", work: "TRAVAIL", rest: "REPOS", done: "TERMINÉ", idle: "PRÊT", running: "EN COURS", paused: "PAUSE" };

function presetLine(p: Preset) {
  if (p.stopwatch) return "temps libre";
  return `${p.work}/${p.rest} ×${p.rounds} · ${fmtClock(presetTotal(p))}`;
}

export default function ChronoView({ nav }: { nav: Nav }) {
  useTimers();
  const p = chrono.preset;
  const [custom, setCustom] = useState({ work: "45", rest: "15", rounds: "6" });

  let phase = chrono.phase;
  let time = "0:00";
  let sub = "";
  let progress = 1;
  if (p.stopwatch) {
    const ms = stopwatchMs();
    time = fmtClock(Math.floor(ms / 1000));
    sub = ms ? `${(ms / 1000).toFixed(1)} s` : "";
    progress = ((ms / 1000) % 60) / 60;
  } else if (phase === "idle") {
    time = fmtClock(p.work);
    sub = `${p.rounds} tours · ${fmtClock(presetTotal(p))}`;
  } else if (phase === "done") {
    time = fmtClock(presetTotal(p));
    sub = `${p.rounds} tours`;
  } else {
    const left = Math.max(0, phaseLeft());
    const dur = phase === "prep" ? PREP_SECONDS : phase === "work" ? p.work : p.rest;
    time = fmtClock(left);
    sub = `Tour ${chrono.round}/${p.rounds}`;
    progress = left / dur;
  }
  const paused = chrono.pausedLeft !== null || phase === "paused";
  const ringClass = phase === "work" || phase === "running" ? "work" : phase === "rest" ? "rest" : "";
  const startLabel = p.stopwatch
    ? phase === "running" ? "Pause" : phase === "paused" ? "Reprendre" : "Démarrer"
    : phase === "idle" ? "Démarrer" : phase === "done" ? "Recommencer" : paused ? "Reprendre" : "Pause";

  const applyCustom = (next: typeof custom) => {
    setCustom(next);
    const work = Math.max(5, parseInt(next.work, 10) || 0);
    const rest = Math.max(0, parseInt(next.rest, 10) || 0);
    const rounds = Math.max(1, parseInt(next.rounds, 10) || 0);
    selectPreset({ ...PRESETS.find((x) => x.custom)!, work, rest, rounds });
  };

  const save = () => {
    const today = todayISO();
    let label: string;
    let type = "HIIT";
    let durationMin: number | undefined;
    if (p.stopwatch) {
      const s = Math.floor(stopwatchMs() / 1000);
      if (!s) { toast("Le chronomètre est à zéro."); return; }
      label = `Chronomètre ${fmtClock(s)}`;
      type = "Autre";
      durationMin = Math.round(s / 60);
    } else {
      const done = completedRounds();
      if (!done) { toast("Aucun tour terminé pour l'instant."); return; }
      if (p.id === "corde") type = "Corde";
      label = `${p.name.replace(/\s\d+\/\d+$/, "")} ${p.work}/${p.rest} ×${done}${done < p.rounds ? ` (sur ${p.rounds})` : ""}`;
      durationMin = Math.round((done * p.work + Math.max(0, done - 1) * p.rest) / 60);
    }
    update((d) => addActivityTo(d, today, { id: uid(), type, label, durationMin }));
    toast(`Ajouté à ${dayLabel(today)}.`);
  };

  return (
    <div className="stack">
      <div className="presets">
        {PRESETS.map((x) => (
          <button key={x.id} type="button" className="preset" aria-pressed={x.id === p.id} onClick={() => (x.custom ? applyCustom(custom) : selectPreset(x))}>
            <b>{x.name}</b>
            <span className="mono">{x.custom && p.custom ? presetLine(p) : presetLine(x)}</span>
            {x.note && <span className="small">{x.note}</span>}
          </button>
        ))}
      </div>

      {p.custom && (
        <div className="card">
          <div className="grid3">
            {(["work", "rest", "rounds"] as const).map((k) => (
              <label key={k} className="lbl" htmlFor={`c-${k}`}>{k === "work" ? "Travail (s)" : k === "rest" ? "Repos (s)" : "Tours"}
                <input className="field mono" id={`c-${k}`} inputMode="numeric" value={custom[k]} onChange={(e) => applyCustom({ ...custom, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card ring-wrap">
        <svg className={`ring ${ringClass}`} viewBox="0 0 240 240" role="timer" aria-label={`${PHASE_LABEL[phase]} ${time}`}>
          <circle className="bg" cx="120" cy="120" r={R} fill="none" strokeWidth="12" />
          <circle className="fg" cx="120" cy="120" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - progress)).toFixed(1)} transform="rotate(-90 120 120)" />
          <text className="phase" x="120" y="86" textAnchor="middle">{PHASE_LABEL[phase]}{paused && !p.stopwatch && phase !== "idle" && phase !== "done" ? " · PAUSE" : ""}</text>
          <text className="big" x="120" y="136" textAnchor="middle">{time}</text>
          <text className="sub" x="120" y="166" textAnchor="middle">{sub}</text>
        </svg>
        <div className="row center">
          <button type="button" className="btn primary" onClick={() => { unlockAudio(); void keepScreenOn(); toggleChrono(); }}>{startLabel}</button>
          <button type="button" className="btn" onClick={resetChrono}>Réinitialiser</button>
          <button type="button" className="btn" onClick={save}>Ajouter à aujourd'hui</button>
        </div>
      </div>
      <p className="small">Bips à 3, 2, 1 avant chaque changement de phase, vibration en fin de série quand l'appareil le permet. Le repos entre séries se lance depuis l'onglet <button type="button" className="linklike" onClick={() => nav.go("seance")}>Séance</button>.</p>
    </div>
  );
}
