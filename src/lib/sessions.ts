import type { Activity } from "./activities";
import { addDays, dayLabel, ddmm, type Lang, mondayOf } from "./dates";
import { type ExerciseEntry, parseLine, splitExercises } from "./parse";
import type { Template } from "./program";
import { type Block, type Data, type Session, uid } from "./store";

export function createSession(date: string, template?: Template | null, source: Session["source"] = "live"): Session {
  return {
    id: uid(),
    date,
    title: template?.title ?? "",
    blocks: (template?.blocks ?? []).map<Block>((b) => ({ ...b, exos: b.exos.map((e) => ({ ...e })), id: uid(), values: [], skipped: false })),
    lines: [],
    activities: [],
    note: "",
    status: source === "live" ? "live" : "done",
    startedAt: source === "live" ? Date.now() : undefined,
    source,
  };
}

/** Lignes au format carnet, blocs remplis puis lignes libres. */
export function sessionLines(s: Session): string[] {
  const out: string[] = [];
  for (const b of s.blocks) {
    if (!b.values.length) continue;
    const name = b.exos.map((e) => e.name).join(" / ");
    const targets = b.exos.map((e) => e.target);
    const target = targets.some(Boolean) ? ` [${targets.join(" / ")}]` : "";
    out.push(`${name} ${b.sets}x${target} : ${b.values.join(", ")}`);
  }
  return out.concat(s.lines);
}

export const hasTraining = (s: Session) => sessionLines(s).length > 0;
export const isEmpty = (s: Session) => !hasTraining(s) && !s.activities.length && !s.note.trim();

export function sessionsOn(data: Data, date: string): Session[] {
  return data.sessions.filter((s) => s.date === date);
}

export function sessionsBetween(data: Data, from: string, to: string): Session[] {
  return data.sessions.filter((s) => s.date >= from && s.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

/** Session du jour qui reçoit une activité ajoutée hors séance. */
export function addActivityTo(data: Data, date: string, activity: Activity): void {
  const existing = data.sessions.find((s) => s.date === date && s.status === "live") ?? data.sessions.find((s) => s.date === date);
  if (existing) existing.activities.push(activity);
  else data.sessions.push({ ...createSession(date, null, "manual"), activities: [activity] });
}

export interface DatedExercise extends ExerciseEntry {
  date: string;
  sessionId: string;
}

export function exercisesOf(s: Session): DatedExercise[] {
  return sessionLines(s).flatMap((l) => {
    const p = parseLine(l);
    return p ? splitExercises(p).map((e) => ({ ...e, date: s.date, sessionId: s.id })) : [];
  });
}

export interface ExerciseIndex {
  key: string;
  name: string;
  entries: DatedExercise[];
}

export function indexExercises(sessions: Session[]): ExerciseIndex[] {
  const map = new Map<string, ExerciseIndex>();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sorted) {
    for (const e of exercisesOf(s)) {
      if (!e.key || !e.values.length) continue;
      const item = map.get(e.key) ?? { key: e.key, name: e.name, entries: [] };
      item.name = e.name;
      item.entries.push(e);
      map.set(e.key, item);
    }
  }
  return [...map.values()].sort((a, b) => b.entries[b.entries.length - 1].date.localeCompare(a.entries[a.entries.length - 1].date));
}

/* ---------- Markdown ---------- */

// Libellés des exports. Les deux formes se réimportent (voir importer.ts).
const MD: Record<Lang, { weekOf: string; other: string; note: string; none: string; context: string; program: string; trends: string; request: string }> = {
  fr: {
    weekOf: "Semaine du", other: "Autre :", note: "Note :", none: "Aucune séance enregistrée.",
    context: "Contexte", program: "Programme en cours",
    trends: "Historique des exercices de la semaine (5 dernières séances)", request: "Demande",
  },
  en: {
    weekOf: "Week of", other: "Other:", note: "Note:", none: "No session logged.",
    context: "Context", program: "Current program",
    trends: "History of this week's exercises (last 5 sessions)", request: "Request",
  },
};

function sessionMarkdown(s: Session, lang: Lang): string {
  const t = MD[lang];
  let md = `## ${dayLabel(s.date, lang)}${s.title ? ` — ${s.title}` : ""}\n\n`;
  const lines = sessionLines(s);
  lines.forEach((l) => (md += `* ${l}\n`));
  if (s.activities.length) md += `${lines.length ? "\n" : ""}${t.other}\n${s.activities.map((a) => `- ${a.label}`).join("\n")}\n`;
  if (s.note.trim()) md += `\n${t.note} ${s.note.trim()}\n`;
  return md;
}

export function weekMarkdown(data: Data, monday: string, lang: Lang = "fr"): string {
  const sessions = sessionsBetween(data, monday, addDays(monday, 6)).filter((s) => !isEmpty(s));
  let md = `# ${MD[lang].weekOf} ${ddmm(monday)}\n`;
  for (const s of sessions) md += `\n${sessionMarkdown(s, lang)}`;
  if (!sessions.length) md += `\n${MD[lang].none}\n`;
  return md;
}

export function allMarkdown(data: Data, lang: Lang = "fr"): string {
  const mondays = [...new Set(data.sessions.filter((s) => !isEmpty(s)).map((s) => mondayOf(s.date)))].sort();
  return mondays.map((m) => weekMarkdown(data, m, lang)).join("\n");
}

/* ---------- Prompt de bilan ---------- */

export interface PromptOptions {
  monday: string;
  context: boolean;
  program: boolean;
  trends: boolean;
  week: boolean;
  question: string;
  lang?: Lang;
}

export function trendsText(data: Data, monday: string, maxPoints = 5): string {
  const end = addDays(monday, 6);
  const weekKeys = new Set(sessionsBetween(data, monday, end).flatMap(exercisesOf).filter((e) => e.values.length).map((e) => e.key));
  if (!weekKeys.size) return "";
  const index = indexExercises(data.sessions.filter((s) => s.date <= end));
  const rows = index
    .filter((i) => weekKeys.has(i.key))
    .map((i) => {
      const pts = i.entries.slice(-maxPoints).map((e) => {
        const meta = [e.load, e.sets ? `${e.sets}x` : null, e.targetTxt ? `[${e.targetTxt}]` : null].filter(Boolean).join(" ");
        return `${ddmm(e.date)} ${meta ? meta + " " : ""}${e.values.map((v) => (v.side ? v.side + " " : "") + v.txt).join(",")}`;
      });
      return `- ${i.name} : ${pts.join(" · ")}`;
    });
  return rows.join("\n");
}

export function buildPrompt(data: Data, o: PromptOptions): string {
  const lang = o.lang ?? "fr";
  const t = MD[lang];
  const parts: string[] = [];
  if (o.context && data.context.trim()) parts.push(`## ${t.context}\n${data.context.trim()}`);
  if (o.program && data.programText.trim()) parts.push(`## ${t.program}\n${data.programText.trim().replace(/^#\s.*\n?/m, "")}`);
  if (o.trends) {
    const tr = trendsText(data, o.monday);
    if (tr) parts.push(`## ${t.trends}\n${tr}`);
  }
  if (o.week) parts.push(weekMarkdown(data, o.monday, lang).replace(/^# /, "## "));
  if (o.question.trim()) parts.push(`## ${t.request}\n${o.question.trim()}`);
  return parts.join("\n\n");
}
