// Import de masse : texte libre au format carnet (Markdown) → journées de séance.
// Les repères sont compris en français et en anglais, quelle que soit la langue de l'interface.
//
//   # Semaine du 05/10  |  # Week of 05/10          (contexte d'année et de semaine, facultatif)
//   ## Lun 05/10 — Titre  |  ## Mon 05/10 — Title   (aussi "Lun 21/09 :", "Mardi 15", "2/ Tuesday 15")
//   * Exercice 4x [5-6] : 6,5,4,4
//   4x Tractions 12kg : Objectif 4-6 reps   suivi de   - 6,5,5,4
//   Autre : / Other:   - vélo 7km               (activités)
//   Note : texte libre
// Le reste d'une journée devient une note ; le texte hors journée est ignoré.

import { type Activity, activityFromText, looksLikeActivity } from "./activities";
import { addDays, DAY_NAME_PATTERN, dayIndexFromName, fromISO, isValidISO, toISO, todayISO, weekday } from "./dates";

export interface ImportedDay {
  date: string;
  title: string;
  lines: string[];
  activities: Activity[];
  note: string;
  warnings: ImportWarning[];
}

export type ImportWarning =
  | { kind: "incomplete"; line: string; day: number }
  | { kind: "weekday"; day: number; month: number; name: string };

export interface ImportResult {
  days: ImportedDay[];
  ignoredLines: number;
  warnings: ImportWarning[];
}

const DAY_RE = new RegExp(
  String.raw`^(?:#{1,6}\s*)?(?:\d+\s*[/.)]\s*)?(${DAY_NAME_PATTERN})\.?\s+(\d{1,2})(?:\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{2,4}))?)?(?!\d)\s*(?:[—–:-]+\s*(.*))?$`,
  "i",
);
const WEEK_RE = /\b(?:semaine\s+(?:du\s+)?|week\s+(?:of\s+)?)(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{2,4}))?/i;
const WEEK_COMPACT_RE = /\b(?:semaine|week)\s+(\d{2})(\d{2})\b/i;
const BULLET_RE = /^\s*(?:[*\-•]|\d+[.)])\s+(.*)$/;
const OLD_HEADER_RE = /^(\d+)\s*[x×]\s+(.+?)\s*:\s*(?:objectifs?|targets?|goals?)\s*:?\s*(.+)$/i;
const VALUES_ONLY_RE = /^(?=.*\d)[\dDGRL\s,;./s]+$/;
const OTHER_RE = /^(?:autres?|others?)\s*:\s*(.*)$/i;
const NOTE_RE = /^notes?\s*:\s*(.*)$/i;
const EXTRA_RE = /^(?:bonus|extra|en compl[ée]ment[^:]*|also)\s*:\s*(.+)$/i;

const looksLikeExercise = (t: string) => /\[[^\]]*\]/.test(t) || /:\s*[DGRL]?\s*\d/.test(t) || /(?:^|\s)\d+\s*[x×]\s/.test(t);

function fullYear(y: string): number {
  const n = parseInt(y, 10);
  return n < 100 ? 2000 + n : n;
}

/** Sans année explicite : l'année qui place la date au plus près, sans dépasser aujourd'hui + 7 jours. */
function inferYear(day: number, month: number, today: string): number {
  const t = fromISO(today);
  const limit = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7);
  const y = t.getFullYear();
  return new Date(y, month - 1, day) > limit ? y - 1 : y;
}

function makeISO(day: number, month: number, year: number): string | null {
  const iso = toISO(new Date(year, month - 1, day));
  const ok = isValidISO(iso) && fromISO(iso).getDate() === day && fromISO(iso).getMonth() === month - 1;
  return ok ? iso : null;
}

function cleanObjective(obj: string): string {
  return obj
    .replace(/\s*\b(?:reps?|répétitions?|repetitions?)\b/gi, "")
    .replace(/\s*\b(?:secondes?|seconds?|secs?)\b/gi, "s")
    .trim();
}

export function parseImport(text: string, newId: () => string, today = todayISO()): ImportResult {
  const result: ImportResult = { days: [], ignoredLines: 0, warnings: [] };
  let weekStart: string | null = null;
  let weekYear: number | null = null;
  let day: ImportedDay | null = null;
  let section: "main" | "autre" | "note" = "main";
  let pendingValues = false;

  const addNote = (t: string) => {
    if (!day || !t) return;
    day.note = day.note ? `${day.note}\n${t}` : t;
  };
  const addEntry = (t: string) => {
    if (!day) return;
    const old = t.match(OLD_HEADER_RE);
    if (old) {
      day.lines.push(`${old[2].trim()} ${old[1]}x [${cleanObjective(old[3])}]`);
      pendingValues = true;
      return;
    }
    day.lines.push(t);
    pendingValues = false;
  };
  const addActivity = (t: string) => {
    if (!day || !t) return;
    day.activities.push(activityFromText(t, newId()));
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const dm = line.match(DAY_RE);
    if (dm) {
      const named = dayIndexFromName(dm[1]);
      const d = parseInt(dm[2], 10);
      let iso: string | null = null;
      if (dm[3]) {
        const m = parseInt(dm[3], 10);
        const y = dm[4] ? fullYear(dm[4]) : weekYear ?? inferYear(d, m, today);
        iso = makeISO(d, m, y);
        // Semaine à cheval sur deux années (semaine du 29/12, jeudi 01/01).
        if (iso && weekStart && !dm[4] && iso < weekStart) iso = makeISO(d, m, y + 1);
      } else {
        const anchor = weekStart ?? (day ? day.date : null);
        if (anchor) {
          for (let i = 0; i < 7; i++) {
            const c = addDays(anchor, i);
            if (fromISO(c).getDate() === d) { iso = c; break; }
          }
        }
      }
      if (!iso) {
        result.warnings.push({ kind: "incomplete", line, day: d });
        day = null;
        continue;
      }
      day = { date: iso, title: (dm[5] ?? "").trim(), lines: [], activities: [], note: "", warnings: [] };
      if (named !== null && named !== weekday(iso)) {
        day.warnings.push({ kind: "weekday", day: d, month: fromISO(iso).getMonth() + 1, name: dm[1].toLowerCase() });
      }
      result.days.push(day);
      section = "main";
      pendingValues = false;
      continue;
    }

    if (!BULLET_RE.test(line)) {
      const wm = line.match(WEEK_RE);
      const wc = wm ? null : line.match(WEEK_COMPACT_RE);
      if (wm || wc) {
        const d = parseInt((wm ?? wc)![1], 10);
        const m = parseInt((wm ?? wc)![2], 10);
        const y = wm && wm[3] ? fullYear(wm[3]) : inferYear(d, m, today);
        const iso = makeISO(d, m, y);
        if (iso) {
          weekStart = iso;
          weekYear = y;
        }
        day = null;
        continue;
      }
    }

    if (!day) {
      result.ignoredLines++;
      continue;
    }

    const autre = line.match(OTHER_RE);
    if (autre) {
      section = "autre";
      if (autre[1]) addActivity(autre[1]);
      continue;
    }
    const note = line.match(NOTE_RE);
    if (note) {
      section = "note";
      addNote(note[1].trim());
      continue;
    }
    const extra = line.match(EXTRA_RE);
    if (extra) {
      if (looksLikeExercise(extra[1]) && !looksLikeActivity(extra[1])) addEntry(extra[1]);
      else addActivity(extra[1]);
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const content = bullet[1].trim();
      if (!content) continue;
      if (pendingValues && VALUES_ONLY_RE.test(content) && day.lines.length) {
        day.lines[day.lines.length - 1] += ` : ${content}`;
        pendingValues = false;
        continue;
      }
      if (section === "autre") {
        if (looksLikeExercise(content) && !looksLikeActivity(content)) addEntry(content);
        else addActivity(content);
        continue;
      }
      section = "main";
      if (looksLikeActivity(content)) addActivity(content);
      else addEntry(content);
      continue;
    }

    // Ligne sans puce.
    if (section === "note") {
      addNote(line);
    } else if (OLD_HEADER_RE.test(line) || (looksLikeExercise(line) && !looksLikeActivity(line))) {
      addEntry(line);
    } else if (looksLikeActivity(line)) {
      addActivity(line);
    } else {
      addNote(line);
    }
  }

  result.days = result.days.filter((d) => d.lines.length || d.activities.length || d.note);
  return result;
}
