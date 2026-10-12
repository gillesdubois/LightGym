import { useState } from "react";
import type { Nav } from "../App";
import { dayLabel, fmtClock, todayISO } from "../lib/dates";
import { keepScreenOn, toast, unlockAudio } from "../lib/device";
import { type Dict, useT } from "../lib/i18n";
import { addActivityTo } from "../lib/sessions";
import { uid, update } from "../lib/store";
import {
  chrono, completedRounds, phaseLeft, PREP_SECONDS, PRESETS, presetTotal, resetChrono,
  selectPreset, stopwatchMs, toggleChrono, useTimers, type Preset,
} from "../lib/timers";

const R = 100;
const C = 2 * Math.PI * R;

const presetName = (t: Dict, p: Preset) => t.chrono.presets[p.id] ?? p.name;

function presetLine(t: Dict, p: Preset) {
  if (p.stopwatch) return t.chrono.freeTime;
  return `${p.work}/${p.rest} ×${p.rounds} · ${fmtClock(presetTotal(p))}`;
}

export default function ChronoView({ nav }: { nav: Nav }) {
  useTimers();
  const t = useT();
  const p = chrono.preset;
  const [custom, setCustom] = useState({ work: "45", rest: "15", rounds: "6" });

  const phase = chrono.phase;
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
    sub = `${t.chrono.rounds(p.rounds)} · ${fmtClock(presetTotal(p))}`;
  } else if (phase === "done") {
    time = fmtClock(presetTotal(p));
    sub = t.chrono.rounds(p.rounds);
  } else {
    const left = Math.max(0, phaseLeft());
    const dur = phase === "prep" ? PREP_SECONDS : phase === "work" ? p.work : p.rest;
    time = fmtClock(left);
    sub = t.chrono.round(chrono.round, p.rounds);
    progress = left / dur;
  }
  const paused = chrono.pausedLeft !== null || phase === "paused";
  const ringClass = phase === "work" || phase === "running" ? "work" : phase === "rest" ? "rest" : "";
  const startLabel = p.stopwatch
    ? phase === "running" ? t.chrono.pause : phase === "paused" ? t.chrono.resume : t.chrono.start
    : phase === "idle" ? t.chrono.start : phase === "done" ? t.chrono.restart : paused ? t.chrono.resume : t.chrono.pause;
  const phaseText = t.chrono.phases[phase] + (paused && !p.stopwatch && phase !== "idle" && phase !== "done" ? t.chrono.pausedSuffix : "");

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
    let type = "hiit";
    let durationMin: number | undefined;
    if (p.stopwatch) {
      const s = Math.floor(stopwatchMs() / 1000);
      if (!s) { toast(t.chrono.zero); return; }
      label = t.chrono.stopwatchLabel(fmtClock(s));
      type = "other";
      durationMin = Math.round(s / 60);
    } else {
      const done = completedRounds();
      if (!done) { toast(t.chrono.noRound); return; }
      if (p.id === "corde") type = "rope";
      label = `${presetName(t, p).replace(/\s\d+\/\d+$/, "")} ${p.work}/${p.rest} ×${done}${done < p.rounds ? ` ${t.chrono.outOf(p.rounds)}` : ""}`;
      durationMin = Math.round((done * p.work + Math.max(0, done - 1) * p.rest) / 60);
    }
    update((d) => addActivityTo(d, today, { id: uid(), type, label, durationMin }));
    toast(t.chrono.addedTo(dayLabel(today, t.lang)));
  };

  return (
    <div className="stack">
      <div className="presets">
        {PRESETS.map((x) => (
          <button key={x.id} type="button" className="preset" aria-pressed={x.id === p.id} onClick={() => (x.custom ? applyCustom(custom) : selectPreset(x))}>
            <b>{presetName(t, x)}</b>
            <span className="mono">{x.custom && p.custom ? presetLine(t, p) : presetLine(t, x)}</span>
            {x.id === "emom" && <span className="small">{t.chrono.emomNote}</span>}
          </button>
        ))}
      </div>

      {p.custom && (
        <div className="card">
          <div className="grid3">
            {(["work", "rest", "rounds"] as const).map((k) => (
              <label key={k} className="lbl" htmlFor={`c-${k}`}>{k === "work" ? t.chrono.work : k === "rest" ? t.chrono.restS : t.chrono.roundsLabel}
                <input className="field mono" id={`c-${k}`} inputMode="numeric" value={custom[k]} onChange={(e) => applyCustom({ ...custom, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card ring-wrap">
        <svg className={`ring ${ringClass}`} viewBox="0 0 240 240" role="timer" aria-label={`${phaseText} ${time}`}>
          <circle className="bg" cx="120" cy="120" r={R} fill="none" strokeWidth="12" />
          <circle className="fg" cx="120" cy="120" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - progress)).toFixed(1)} transform="rotate(-90 120 120)" />
          <text className="phase" x="120" y="86" textAnchor="middle">{phaseText}</text>
          <text className="big" x="120" y="136" textAnchor="middle">{time}</text>
          <text className="sub" x="120" y="166" textAnchor="middle">{sub}</text>
        </svg>
        <div className="row center">
          <button type="button" className="btn primary" onClick={() => { unlockAudio(); void keepScreenOn(); toggleChrono(); }}>{startLabel}</button>
          <button type="button" className="btn" onClick={resetChrono}>{t.chrono.reset}</button>
          <button type="button" className="btn" onClick={save}>{t.chrono.addToday}</button>
        </div>
      </div>
      <p className="small">{t.chrono.help} <button type="button" className="linklike" onClick={() => nav.go("seance")}>{t.chrono.helpLink}</button>.</p>
    </div>
  );
}
