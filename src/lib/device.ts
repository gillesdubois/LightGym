// Son, vibration, écran allumé et petits messages : tout ce qui dépend du navigateur.

import { useSyncExternalStore } from "react";

/* ---------- Son ---------- */
let actx: AudioContext | null = null;

/** À appeler sur un geste de l'utilisateur : iOS ne joue aucun son sinon. */
export function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!actx && Ctor) actx = new Ctor();
    if (actx?.state === "suspended") void actx.resume();
  } catch {
    /* pas de son disponible */
  }
}

export function beep(freq = 880, dur = 0.2): void {
  if (!actx) return;
  try {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const t = actx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start();
    o.stop(t + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/* ---------- Écran allumé ---------- */
type WakeState = "off" | "on" | "unsupported";
let wakeLock: WakeLockSentinel | null = null;
let wakeWanted = false;
let wakeState: WakeState = "off";
const wakeListeners = new Set<() => void>();
const setWake = (s: WakeState) => {
  wakeState = s;
  wakeListeners.forEach((l) => l());
};

export async function keepScreenOn(): Promise<void> {
  wakeWanted = true;
  if (wakeLock) return;
  try {
    if (!("wakeLock" in navigator)) throw new Error("unsupported");
    wakeLock = await navigator.wakeLock.request("screen");
    setWake("on");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
      setWake("off");
    });
  } catch {
    setWake("unsupported");
  }
}

export function releaseScreen(): void {
  wakeWanted = false;
  void wakeLock?.release();
  wakeLock = null;
  setWake("off");
}

// Le verrou saute quand l'app passe en arrière-plan : on le reprend au retour.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wakeWanted && !wakeLock) void keepScreenOn();
  });
}

export const useWakeState = () =>
  useSyncExternalStore(
    (l) => {
      wakeListeners.add(l);
      return () => wakeListeners.delete(l);
    },
    () => wakeState,
  );

/* ---------- Messages ---------- */
let toastMsg: string | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();

export function toast(msg: string): void {
  toastMsg = msg;
  toastListeners.forEach((l) => l());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg = null;
    toastListeners.forEach((l) => l());
  }, 2600);
}

export const useToast = () =>
  useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toastMsg,
  );

/* ---------- Fichiers ---------- */
export function downloadText(filename: string, text: string, type = "text/markdown"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
