// Minuteurs qui continuent de tourner quand on change d'onglet : repos entre séries et chrono d'intervalles.
// Le temps est calculé depuis Date.now(), donc juste même si le navigateur ralentit les intervalles.

import { useSyncExternalStore } from "react";
import { beep, vibrate } from "./device";

let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
export const useTimers = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );

/* ---------- Repos ---------- */
export interface RestState {
  end: number;
  total: number;
  overAt: number | null;
  warned: number;
}
export let rest: RestState | null = null;

export function startRest(seconds: number): void {
  rest = { end: Date.now() + seconds * 1000, total: seconds, overAt: null, warned: 0 };
  emit();
}
export function addRest(seconds: number): void {
  if (!rest) return;
  rest.end = Math.max(Date.now(), rest.end) + seconds * 1000;
  rest.total += seconds;
  rest.overAt = null;
  emit();
}
export function stopRest(): void {
  rest = null;
  emit();
}

/* ---------- Chrono ---------- */
export interface Preset {
  id: string;
  name: string;
  work: number;
  rest: number;
  rounds: number;
  stopwatch?: boolean;
  custom?: boolean;
}

export const PRESETS: Preset[] = [
  { id: "corde", name: "Corde 60/20", work: 60, rest: 20, rounds: 10 },
  { id: "tabata", name: "Tabata", work: 20, rest: 10, rounds: 8 },
  { id: "hiit", name: "HIIT 40/20", work: 40, rest: 20, rounds: 10 },
  { id: "emom", name: "EMOM", work: 60, rest: 0, rounds: 10 },
  { id: "watch", name: "Chronomètre", work: 0, rest: 0, rounds: 0, stopwatch: true },
  { id: "custom", name: "Personnalisé", work: 45, rest: 15, rounds: 6, custom: true },
];

export const PREP_SECONDS = 5;

export type Phase = "idle" | "prep" | "work" | "rest" | "done" | "running" | "paused";

export const chrono = {
  preset: PRESETS[0],
  phase: "idle" as Phase,
  round: 0,
  end: 0,
  pausedLeft: null as number | null,
  swStart: 0,
  swAcc: 0,
  startedAt: 0,
};

export const presetTotal = (p: Preset) => p.rounds * p.work + Math.max(0, p.rounds - 1) * p.rest;

export function selectPreset(p: Preset): void {
  resetChrono();
  chrono.preset = p;
  emit();
}

export function resetChrono(): void {
  Object.assign(chrono, { phase: "idle", round: 0, end: 0, pausedLeft: null, swStart: 0, swAcc: 0, startedAt: 0 });
  emit();
}

export function stopwatchMs(): number {
  return chrono.swAcc + (chrono.phase === "running" ? Date.now() - chrono.swStart : 0);
}

export function toggleChrono(): void {
  const p = chrono.preset;
  if (p.stopwatch) {
    if (chrono.phase === "running") {
      chrono.swAcc += Date.now() - chrono.swStart;
      chrono.phase = "paused";
    } else {
      chrono.swStart = Date.now();
      chrono.phase = "running";
    }
  } else if (chrono.phase === "idle" || chrono.phase === "done") {
    Object.assign(chrono, { round: 1, phase: "prep", end: Date.now() + PREP_SECONDS * 1000, pausedLeft: null, startedAt: Date.now() });
    beep(660, 0.1);
  } else if (chrono.pausedLeft !== null) {
    chrono.end = Date.now() + chrono.pausedLeft;
    chrono.pausedLeft = null;
  } else {
    chrono.pausedLeft = chrono.end - Date.now();
  }
  emit();
}

export const chronoActive = () =>
  chrono.preset.stopwatch ? chrono.phase === "running" : ["prep", "work", "rest"].includes(chrono.phase) && chrono.pausedLeft === null;

export function phaseLeft(): number {
  return (chrono.pausedLeft ?? chrono.end - Date.now()) / 1000;
}

/** Tours terminés (pour l'enregistrement d'une séance interrompue). */
export function completedRounds(): number {
  if (chrono.phase === "done") return chrono.preset.rounds;
  if (chrono.phase === "rest") return chrono.round;
  return Math.max(0, chrono.round - 1);
}

/* ---------- Minuteur guidé (blocs minutés : yoga, routine de mobilité) ---------- */

export interface GuidedStep {
  name: string;
  cue?: string;
  seconds: number;
  /** Étape par côté : premier ou second côté. */
  side?: "first" | "second";
}

export const guided = {
  /** Bloc en cours ("sessionId:blockId"), null si aucun. */
  key: null as string | null,
  steps: [] as GuidedStep[],
  /** -1 pendant la préparation. */
  index: -1,
  end: 0,
  pausedLeft: null as number | null,
  /** Début de la première étape et temps passé en pause, pour mesurer le temps réel. */
  startedAt: 0,
  pausedAt: 0,
  pausedTotal: 0,
  onDone: null as ((seconds: number) => void) | null,
};

export function startGuided(key: string, steps: GuidedStep[], onDone: (seconds: number) => void): void {
  Object.assign(guided, {
    key, steps, index: -1, end: Date.now() + PREP_SECONDS * 1000,
    pausedLeft: null, startedAt: 0, pausedAt: 0, pausedTotal: 0, onDone,
  });
  beep(660, 0.1);
  emit();
}

export function toggleGuided(): void {
  if (!guided.key) return;
  if (guided.pausedLeft !== null) {
    guided.end = Date.now() + guided.pausedLeft;
    guided.pausedLeft = null;
    if (guided.pausedAt) guided.pausedTotal += Date.now() - guided.pausedAt;
    guided.pausedAt = 0;
  } else {
    guided.pausedLeft = guided.end - Date.now();
    guided.pausedAt = Date.now();
  }
  emit();
}

function enterStep(i: number, at: number): void {
  guided.index = i;
  if (i === 0 && !guided.startedAt) guided.startedAt = at;
  guided.end = at + guided.steps[i].seconds * 1000;
  // Bip double au changement de côté, bip simple au changement d'exercice.
  if (guided.steps[i].side === "second") { beep(740, 0.12); setTimeout(() => beep(740, 0.12), 180); }
  else beep(880, 0.3);
  vibrate(120);
}

/** Saute à l'étape suivante (ou précédente) sans attendre la fin du temps. */
export function jumpGuided(delta: 1 | -1): void {
  if (!guided.key) return;
  const next = Math.max(0, guided.index + delta);
  if (next >= guided.steps.length) { finishGuided(); return; }
  const paused = guided.pausedLeft !== null;
  enterStep(next, Date.now());
  if (paused) guided.pausedLeft = guided.end - Date.now();
  emit();
}

/** Termine le bloc, au bout du temps ou plus tôt : enregistre le temps réellement passé. */
export function finishGuided(): void {
  if (!guided.key) return;
  const now = Date.now();
  const paused = guided.pausedAt ? now - guided.pausedAt : 0;
  const spent = guided.startedAt ? Math.round((now - guided.startedAt - guided.pausedTotal - paused) / 1000) : 0;
  const done = guided.onDone;
  guided.key = null;
  guided.onDone = null;
  emit();
  done?.(spent);
}

export function cancelGuided(): void {
  guided.key = null;
  guided.onDone = null;
  emit();
}

export const guidedLeft = () => (guided.pausedLeft ?? guided.end - Date.now()) / 1000;

/* ---------- Boucle ---------- */
let lastWarn = "";
function tick() {
  let changed = false;

  if (rest) {
    const left = (rest.end - Date.now()) / 1000;
    const s = Math.ceil(left);
    if (left > 0 && s <= 3 && rest.warned !== s) {
      rest.warned = s;
      beep(520, 0.08);
    }
    if (left <= 0 && !rest.overAt) {
      rest.overAt = Date.now();
      beep(880, 0.4);
      vibrate([200, 80, 200]);
    }
    if (rest.overAt && Date.now() - rest.overAt > 5000) rest = null;
    changed = true;
  }

  const p = chrono.preset;
  if (p.stopwatch) {
    if (chrono.phase === "running") changed = true;
  } else if (["prep", "work", "rest"].includes(chrono.phase) && chrono.pausedLeft === null) {
    changed = true;
    let left = chrono.end - Date.now();
    // Rattrape plusieurs phases si l'app a été mise en veille.
    while (left <= 0 && chrono.phase !== "done") {
      const base = chrono.end;
      if (chrono.phase === "prep") {
        chrono.phase = "work";
        chrono.end = base + p.work * 1000;
        beep(880, 0.3);
      } else if (chrono.phase === "work") {
        if (chrono.round >= p.rounds) {
          chrono.phase = "done";
          beep(988, 0.7);
          vibrate([300, 100, 300]);
          break;
        }
        if (p.rest > 0) {
          chrono.phase = "rest";
          chrono.end = base + p.rest * 1000;
          beep(440, 0.3);
        } else {
          chrono.round++;
          chrono.end = base + p.work * 1000;
          beep(880, 0.3);
        }
      } else if (chrono.phase === "rest") {
        chrono.round++;
        chrono.phase = "work";
        chrono.end = base + p.work * 1000;
        beep(880, 0.3);
      }
      left = chrono.end - Date.now();
    }
    const s = Math.ceil(left / 1000);
    const key = `${chrono.phase}${chrono.round}${s}`;
    if (chrono.phase !== "done" && s > 0 && s <= 3 && key !== lastWarn) {
      lastWarn = key;
      beep(600, 0.07);
    }
  }

  if (guided.key && guided.pausedLeft === null) {
    changed = true;
    while (guided.key && Date.now() >= guided.end) {
      const next = guided.index + 1;
      if (next >= guided.steps.length) {
        beep(988, 0.7);
        vibrate([300, 100, 300]);
        finishGuided();
        break;
      }
      enterStep(next, guided.end);
    }
    if (guided.key) {
      const s = Math.ceil((guided.end - Date.now()) / 1000);
      const key = `g${guided.index}:${s}`;
      if (s > 0 && s <= 3 && key !== lastWarn) {
        lastWarn = key;
        beep(600, 0.07);
      }
    }
  }

  if (changed) emit();
}

if (typeof window !== "undefined") setInterval(tick, 200);
