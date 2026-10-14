import { fmtClock } from "../lib/dates";
import { keepScreenOn, unlockAudio } from "../lib/device";
import { useT } from "../lib/i18n";
import { timedTotal } from "../lib/program";
import type { Block } from "../lib/store";
import {
  cancelGuided, finishGuided, guided, guidedLeft, type GuidedStep, jumpGuided, PREP_SECONDS,
  startGuided, toggleGuided, useTimers,
} from "../lib/timers";

/** Étapes d'un bloc minuté ; une étape "par côté" devient deux étapes consécutives. */
export function guidedSteps(b: Pick<Block, "exos">): GuidedStep[] {
  return b.exos.flatMap((e): GuidedStep[] => {
    const base = { name: e.name, cue: e.cue, seconds: e.seconds ?? 0 };
    return e.perSide ? [{ ...base, side: "first" }, { ...base, side: "second" }] : [base];
  });
}

/** Bloc minuté (yoga, routine de mobilité) : les étapes s'enchaînent seules, avec consigne et changement de côté. */
export default function GuidedBlock({ guidedKey, block, heading, onComplete }: {
  guidedKey: string;
  block: Block;
  heading: string;
  onComplete: (seconds: number) => void;
}) {
  useTimers();
  const t = useT();
  const g = t.session.guided;
  const steps = guidedSteps(block);
  const mine = guided.key === guidedKey;
  const busy = guided.key !== null && !mine;

  if (!mine) {
    return (
      <>
        <span className="blk-label">{heading}</span>
        <span className="small mono">{g.steps(steps.length)} · {g.total(fmtClock(timedTotal(block)))}</span>
        <ol className="steps-list">
          {block.exos.map((e, i) => (
            <li key={i}>
              <span>{e.name}</span>
              <span className="mono small">{fmtClock(e.seconds ?? 0)}{e.perSide ? ` ×2` : ""}</span>
            </li>
          ))}
        </ol>
        {busy && <span className="small">{g.otherRunning}</span>}
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            unlockAudio();
            void keepScreenOn();
            startGuided(guidedKey, steps, onComplete);
          }}
        >{g.start}</button>
      </>
    );
  }

  const i = guided.index;
  const step = i >= 0 ? steps[i] : null;
  const left = Math.max(0, guidedLeft());
  const dur = step ? step.seconds : PREP_SECONDS;
  const upcoming = steps[i + 1];
  const sideLabel = (s?: GuidedStep) => (s?.side === "first" ? g.firstSide : s?.side === "second" ? g.secondSide : null);
  const paused = guided.pausedLeft !== null;

  return (
    <div className="guided" aria-live="polite">
      <div className="row between">
        <span className="blk-label">{step ? g.step(i + 1, steps.length) : g.prep}</span>
        {sideLabel(step ?? undefined) && <span className="pill live">{sideLabel(step ?? undefined)}</span>}
      </div>
      <div className="guided-name">{(step ?? steps[0]).name}</div>
      {(step ?? steps[0]).cue && <p className="guided-cue">{(step ?? steps[0]).cue}</p>}
      <div className={`guided-time mono ${paused ? "paused" : ""}`}>{fmtClock(left)}</div>
      <div className="progress"><i style={{ width: `${Math.min(100, (1 - left / dur) * 100)}%` }} /></div>
      {upcoming && (
        <span className="small">{g.next} {upcoming.name}{sideLabel(upcoming) ? ` · ${sideLabel(upcoming)}` : ""}</span>
      )}
      <div className="guided-controls">
        <button type="button" className="btn" disabled={i <= 0} onClick={() => jumpGuided(-1)}>{g.prev}</button>
        <button type="button" className="btn primary" onClick={toggleGuided}>{paused ? t.chrono.resume : t.chrono.pause}</button>
        <button type="button" className="btn" onClick={() => jumpGuided(1)}>{g.skip}</button>
      </div>
      <div className="row between">
        <button type="button" className="btn sm" onClick={finishGuided}>{g.finish}</button>
        <button type="button" className="btn sm ghost danger" onClick={cancelGuided}>{g.stop}</button>
      </div>
    </div>
  );
}
