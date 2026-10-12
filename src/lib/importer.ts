// Import de masse : texte libre au format carnet (Markdown) → journées de séance.
//
// Reconnu :
//   # Semaine du 05/10            (contexte d'année et de semaine, facultatif)
//   ## Lun 05/10 — Titre          (aussi "Lun 21/09 :", "Mardi 15", "2/ Mardi 15")
//   * Exercice 4x [5-6] : 6,5,4,4
//   4x Tractions 12kg : Objectif 4-6 reps   suivi de   - 6,5,5,4
//   Autre :  - vélo 7km           (activités)
//   Note : texte libre
// Le reste d'une journée devient une note ; le texte hors journée est ignoré.

import { type Activity, activityFromText, looksLikeActivity } from "./activities";
import { addDays, dayIndexFromName, fromISO, isValidISO, toISO, todayISO, weekday } from "./dates";

export interface ImportedDay {
  date: string;
  title: string;
  lines: string[];
  activities: Activity[];
  note: string;
  warnings: string[];
}

export interface ImportResult {
  days: ImportedDay[];
  ignoredLines: number;
  warnings: string[];
}

const DAY_RE =
  /^(?:#{1,6}\s*)?(?:\d+\s*[/.)]\s*)?(lun(?:di)?|mar(?:di)?|mer(?:credi)?|jeu(?:di)?|ven(?:dredi)?|sam(?:edi)?|dim(?:anche)?)\.?\s+(\d{1,2})(?:\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{2,4}))?)?(?!\d)\s*(?:[—–:-]+\s*(.*))?$/i;
const WEEK_RE = /\bsemaine\s+(?:du\s+)?(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{2,4}))?/i;
const WEEK_COMPACT_RE = /\bsemaine\s+(\d{2})(\d{2})\b/i;
const BULLET_RE = /^\s*(?:[*\-•]|\d+[.)])\s+(.*)$/;
const OLD_HEADER_RE = /^(\d+)\s*[x×]\s+(.+?)\s*:\s*objectifs?\s*:?\s*(.+)$/i;
const VALUES_ONLY_RE = /^(?=.*\d)[\dDG\s,;./s]+$/;

const looksLikeExercise = (t: string) => /\[[^\]]*\]/.test(t) || /:\s*[DG]?\s*\d/.test(t) || /(?:^|\s)\d+\s*[x×]\s/.test(t);

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
    .replace(/\s*\b(?:reps?|répétitions?)\b/gi, "")
    .replace(/\s*\b(?:secondes?|secs?)\b/gi, "s")
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
        result.warnings.push(`« ${line} » : date incomplète, journée ignorée (ajoute le mois, ex. ${d}/10).`);
        day = null;
        continue;
      }
      day = { date: iso, title: (dm[5] ?? "").trim(), lines: [], activities: [], note: "", warnings: [] };
      if (named !== null && named !== weekday(iso)) {
        day.warnings.push(`Le ${d}/${fromISO(iso).getMonth() + 1} n'est pas un ${dm[1].toLowerCase()} : la date est conservée.`);
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

    const autre = line.match(/^autres?\s*:\s*(.*)$/i);
    if (autre) {
      section = "autre";
      if (autre[1]) addActivity(autre[1]);
      continue;
    }
    const note = line.match(/^notes?\s*:\s*(.*)$/i);
    if (note) {
      section = "note";
      addNote(note[1].trim());
      continue;
    }
    const extra = line.match(/^(?:bonus|en compl[ée]ment[^:]*)\s*:\s*(.+)$/i);
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
