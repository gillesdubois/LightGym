// Lecture permissive d'une ligne de notes, par exemple :
//   Tractions +12kg 4x [5-6] : 6,5,4,4
//   Pistol / Goblet 20kg 4x [5-6 / 8-10] : 6/10, 6/10
// Tout ce qui n'est pas reconnu est conservé tel quel.

export interface Target {
  low: number;
  high: number;
}

export interface Value {
  txt: string;
  kind: "num" | "pair" | "txt";
  /** Côté : D/G en français, R/L en anglais. */
  side: "D" | "G" | "R" | "L" | null;
  num?: number;
  pair?: [number, number];
  unit?: string;
  cls: "" | "top" | "low" | "txt";
}

export interface ParsedLine {
  raw: string;
  name: string;
  left: string;
  load: string | null;
  sets: number | null;
  targetTxt: string | null;
  target: Target | null;
  /** Objectifs des deux exercices d'un superset. */
  pairTargets: (Target | null)[] | null;
  values: Value[];
  note: string | null;
  free: boolean;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const toNum = (s: string) => parseFloat(s.replace(",", "."));

export function parseTarget(t: string | null | undefined): Target | null {
  if (!t) return null;
  const range = t.match(new RegExp(`(${NUM})\\s*(?:-|–|à)\\s*(${NUM})`));
  if (range) return { low: toNum(range[1]), high: toNum(range[2]) };
  const one = t.match(new RegExp(NUM));
  return one ? { low: toNum(one[0]), high: toNum(one[0]) } : null;
}

/** Classe une valeur par rapport à son objectif : haut de fourchette, sous l'objectif ou entre les deux. */
function score(n: number, t: Target | null): "top" | "low" | "" | null {
  if (!t) return null;
  return n >= t.high ? "top" : n < t.low ? "low" : "";
}

/**
 * Lit une valeur de série. `target` s'applique aux valeurs simples et aux deux côtés d'une paire ("4/4" par côté) ;
 * `pairTargets` donne l'objectif de chaque exercice d'un superset ("8/15" pour [8-10 / 15]).
 */
export function parseValue(token: string, target: Target | null = null, pairTargets: (Target | null)[] | null = null): Value | null {
  const raw = token.trim();
  if (!raw) return null;
  const v: Value = { txt: raw, kind: "txt", side: null, cls: "" };
  let rest = ` ${raw} `;
  const side = rest.match(/(?:^|[\s\d])([DGRL])(?=[\s\d])/);
  if (side) {
    v.side = side[1] as Value["side"];
    rest = rest.replace(/([\s\d])?[DGRL](?=[\s\d])/, "$1 ");
  }
  rest = rest.trim();
  let m: RegExpMatchArray | null;
  if ((m = rest.match(new RegExp(`^(${NUM})\\s*(s|kg|m|km)?\\s*\\/\\s*(${NUM})\\s*(s|kg|m|km)?$`, "i")))) {
    v.kind = "pair";
    v.pair = [toNum(m[1]), toNum(m[3])];
    v.txt = `${m[1]}${m[2] ?? ""}/${m[3]}${m[4] ?? ""}`;
    const scores = v.pair.map((n, i) => score(n, pairTargets ? pairTargets[i] ?? null : target));
    if (scores.every((x) => x !== null)) {
      v.cls = scores.every((x) => x === "top") ? "top" : scores.some((x) => x === "low") ? "low" : "";
    }
  } else if ((m = rest.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/))) {
    // Durée m:ss ou h:mm:ss (bloc minuté) : comparée en secondes.
    v.kind = "num";
    v.num = (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    v.unit = "time";
    v.txt = rest;
  } else if ((m = rest.match(new RegExp(`^(${NUM})\\s*(s|sec|secs|secondes?|min|km|m|kg|reps?)?$`, "i")))) {
    v.kind = "num";
    v.num = toNum(m[1]);
    let unit = (m[2] ?? "").toLowerCase();
    if (/^sec/.test(unit)) unit = "s";
    if (/^rep/.test(unit)) unit = "";
    v.unit = unit;
    v.txt = m[1] + unit;
    v.cls = score(v.num, target) ?? "";
  } else {
    v.cls = "txt";
  }
  return v;
}

const UNIT_RE = /^(?:par\s+|per\s+)?(?:jambe|côté|cote|bras|leg|side|arm)s?$/i;

/** "8-10 / 15" → ["8-10", "15"] ; "5-6 / jambe" reste un seul objectif. */
export function splitTargets(t: string | null): string[] {
  if (!t) return [];
  const out: string[] = [];
  for (const part of t.split(/\s*\/\s*/)) {
    if (UNIT_RE.test(part.trim()) && out.length) out[out.length - 1] += ` / ${part.trim()}`;
    else out.push(part.trim());
  }
  return out;
}

export function parseLine(line: string): ParsedLine | null {
  const s = String(line).trim().replace(/^[*\-•]\s*/, "");
  if (!s) return null;
  const out: ParsedLine = {
    raw: s, name: s, left: s, load: null, sets: null, targetTxt: null,
    target: null, pairTargets: null, values: [], note: null, free: false,
  };
  const idx = s.indexOf(":");
  if (idx === -1) {
    out.free = true;
    return out;
  }
  let left = s.slice(0, idx);
  const right = s.slice(idx + 1);
  const t = left.match(/\[([^\]]+)\]/);
  if (t) {
    out.targetTxt = t[1].trim();
    const targets = splitTargets(out.targetTxt);
    if (targets.length === 2) out.pairTargets = targets.map(parseTarget);
    else if (targets.length === 1) out.target = parseTarget(targets[0]);
    left = left.replace(t[0], " ");
  }
  const st = left.match(/(?:^|\s)(\d+)\s*[x×](?=\s|$)/i);
  if (st) {
    out.sets = parseInt(st[1], 10);
    left = left.replace(st[0], " ");
  }
  out.left = left.replace(/\s{2,}/g, " ").trim();
  const ld = left.match(new RegExp(`([+\\-]?\\s?${NUM})\\s*kg`, "i"));
  if (ld) {
    out.load = ld[1].replace(/\s/g, "") + " kg";
    left = left.replace(ld[0], " ");
  }
  out.name = left.replace(/\s{2,}/g, " ").replace(/[\s,;]+$/, "").trim() || "Sans nom";

  // Une phrase après les valeurs devient une note : "12s, 11s. dernier en tuck"
  const parts = right.split(/\.\s+(?=\D)|\s+—\s+/);
  const vals = parts.shift() ?? "";
  if (parts.length) out.note = parts.join(". ").trim() || null;
  out.values = vals.split(/[,;]/).map((x) => parseValue(x, out.target, out.pairTargets)).filter((x): x is Value => x !== null);
  return out;
}

/** Toutes les séries (valeurs simples ou paires de superset) atteignent le haut de l'objectif. */
export function allAtTop(p: ParsedLine): boolean {
  if (!p.target && !p.pairTargets) return false;
  const scored = p.values.filter((v) => v.kind === "num" || v.kind === "pair");
  if (!scored.length) return false;
  if (p.sets && scored.length < p.sets) return false;
  return scored.every((v) => v.cls === "top");
}

export interface ExerciseEntry {
  name: string;
  key: string;
  load: string | null;
  sets: number | null;
  targetTxt: string | null;
  values: Value[];
}

export function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(new RegExp(`[+\\-]?\\s?${NUM}\\s*kg`, "g"), " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadOf(segment: string): { name: string; load: string | null } {
  const ld = segment.match(new RegExp(`([+\\-]?\\s?${NUM})\\s*kg`, "i"));
  const name = (ld ? segment.replace(ld[0], " ") : segment).replace(/\s{2,}/g, " ").trim();
  return { name: name || segment.trim(), load: ld ? ld[1].replace(/\s/g, "") + " kg" : null };
}

/** Découpe une ligne en exercices ; un superset "A / B : 6/10, 6/10" donne deux exercices. */
export function splitExercises(p: ParsedLine): ExerciseEntry[] {
  if (p.free) return [];
  const segments = p.left.split(/\s+\/\s+/);
  const pairs = p.values.filter((v) => v.kind === "pair");
  if (segments.length === 2 && pairs.length && pairs.length >= p.values.length / 2) {
    const targets = splitTargets(p.targetTxt);
    return segments.map((seg, i) => {
      const { name, load } = loadOf(seg);
      const target = targets.length === 2 ? parseTarget(targets[i]) : null;
      const values = p.values
        .filter((v) => v.kind === "pair")
        .map((v) => parseValue(String(v.pair![i]) + (/s$/.test(v.txt.split("/")[i]) ? "s" : ""), target))
        .filter((x): x is Value => x !== null);
      return {
        name, key: exerciseKey(name), load, sets: p.sets,
        targetTxt: targets.length === 2 ? targets[i] : null, values,
      };
    });
  }
  return [{ name: p.name, key: exerciseKey(p.name), load: p.load, sets: p.sets, targetTxt: p.targetTxt, values: p.values }];
}

export function bestOf(values: Value[]): number | null {
  const nums = values.filter((v) => v.kind === "num").map((v) => v.num!);
  return nums.length ? Math.max(...nums) : null;
}
