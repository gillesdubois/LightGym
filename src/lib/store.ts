// État de l'application, stocké sur l'appareil (localStorage). Aucune donnée ne quitte le navigateur.

import { useSyncExternalStore } from "react";
import { type Activity, LEGACY_TYPES } from "./activities";
import type { BlockDef } from "./program";

export interface Block extends BlockDef {
  id: string;
  values: string[];
  skipped: boolean;
}

export interface Session {
  id: string;
  date: string;
  title: string;
  blocks: Block[];
  lines: string[];
  activities: Activity[];
  note: string;
  status: "live" | "done";
  startedAt?: number;
  source: "live" | "import" | "manual";
  /** Élément du planning dont la séance est issue. */
  planId?: string;
}

/** Un bloc du programme placé sur un jour. Fait dès qu'une séance porte son id. */
export interface PlanItem {
  id: string;
  date: string;
  templateId: string;
  /** Titre au moment de la planification, affiché si le bloc disparaît du programme. */
  title: string;
}

export type LangSetting = "auto" | "fr" | "en";

export interface Settings {
  defaultRest: number;
  skillRest: number;
  targetMinutes: number;
  lang: LangSetting;
}

export interface Data {
  version: 1;
  sessions: Session[];
  plan: PlanItem[];
  programText: string;
  context: string;
  /** Demande du prompt de bilan ; null = demande par défaut dans la langue de l'interface. */
  question: string | null;
  settings: Settings;
  activeId: string | null;
}

const KEY = "lightgym:v1";

export const DEFAULT_SETTINGS: Settings = { defaultRest: 90, skillRest: 150, targetMinutes: 40, lang: "auto" };

const emptyData = (): Data => ({
  version: 1,
  sessions: [],
  plan: [],
  programText: "",
  context: "",
  question: null,
  settings: { ...DEFAULT_SETTINGS },
  activeId: null,
});

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

function normalizeSession(s: Partial<Session>): Session {
  return {
    id: s.id || uid(),
    date: s.date || "1970-01-01",
    title: s.title ?? "",
    blocks: arr<Block>(s.blocks).map((b) => ({
      ...b,
      tag: (b.tag as string) === "noyau" ? "core" : b.tag,
      values: arr<string>(b.values),
      skipped: !!b.skipped,
      exos: arr(b.exos),
    })),
    lines: arr<string>(s.lines),
    activities: arr<Activity>(s.activities).map((a) => ({ ...a, id: a.id || uid(), type: LEGACY_TYPES[a.type] ?? a.type })),
    note: s.note ?? "",
    status: s.status === "live" ? "live" : "done",
    startedAt: s.startedAt,
    source: s.source ?? "manual",
    planId: s.planId,
  };
}

/** Accepte une sauvegarde partielle ou ancienne et la complète. */
export function migrate(raw: unknown): Data {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<Data>;
  const base = emptyData();
  return {
    version: 1,
    sessions: arr<Partial<Session>>(d.sessions).map(normalizeSession),
    plan: arr<Partial<PlanItem>>(d.plan)
      .filter((p) => p.date && p.templateId)
      .map((p) => ({ id: p.id || uid(), date: p.date!, templateId: p.templateId!, title: p.title ?? "" })),
    programText: typeof d.programText === "string" ? d.programText : base.programText,
    context: typeof d.context === "string" ? d.context : base.context,
    question: typeof d.question === "string" ? d.question : null,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    activeId: d.activeId ?? null,
  };
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* stockage indisponible : on repart d'un état vide */
  }
  return emptyData();
}

let data: Data = typeof localStorage === "undefined" ? emptyData() : load();
let saveFailed = false;
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
}

export function update(fn: (draft: Data) => void): void {
  const draft = structuredClone(data);
  fn(draft);
  data = draft;
  persist();
  listeners.forEach((l) => l());
}

export function replaceAll(next: Data): void {
  data = migrate(next);
  persist();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getData = () => data;
/** Vrai quand le dernier enregistrement a échoué (stockage plein ou bloqué). */
export const getSaveFailed = () => saveFailed;
export const useData = () => useSyncExternalStore(subscribe, getData);

// Synchronise les onglets ouverts en parallèle.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      data = migrate(JSON.parse(e.newValue));
      listeners.forEach((l) => l());
    } catch {
      /* ignore */
    }
  });
}

/** Demande au navigateur de ne pas effacer les données (utile sur iOS). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return null;
}
