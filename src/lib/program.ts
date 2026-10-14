// Programme écrit en texte, transformé en gabarits de séance. Repères en français ou en anglais.
//
//   ## Lundi — Pull                         ## Monday — Pull
//   Bloc 1 · skill | repos 2:30             Block 1 · skill | rest 2:30
//   - Front lever one-leg 5x [8-12s]        - Front lever one-leg 5x [8-12s]
//   Superset A · noyau | 4 tours | …        Superset A · core | 4 rounds | rest 1:30
//
// Un titre sans jour ("## Séance courte") donne un gabarit disponible n'importe quel jour.

import { DAY_NAME_PATTERN, dayIndexFromName, type Lang } from "./dates";

export interface ExoDef {
  name: string;
  target: string;
}

export interface BlockDef {
  label: string;
  tag?: "core" | "bonus";
  kind: "skill" | "superset" | "single";
  exos: ExoDef[];
  sets: number;
  rest: number;
}

export interface Template {
  id: string;
  name: string;
  title: string;
  weekday: number | null;
  blocks: BlockDef[];
}

export interface ProgramSettings {
  defaultRest: number;
  skillRest: number;
}

export type ProgramWarning =
  | { kind: "emptyBlock"; block: string; template: string }
  | { kind: "emptyTemplate"; template: string };

const DAY_HEAD_RE = new RegExp(String.raw`^(${DAY_NAME_PATTERN})\.?(?:\s*(?:[—–:-]+)\s*(.*))?$`, "i");
const TAG_WORDS = String.raw`bonus|optional|optionnel|noyau|core`;

function parseRest(text: string): number | null {
  const m = text.match(/(?:repos|rest)\s*(\d+)\s*(?::\s*(\d{1,2}))?\s*(min|mn|s|sec)?/i);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  if (m[2] !== undefined) return a * 60 + parseInt(m[2], 10);
  if (m[3] && /^s/i.test(m[3])) return a;
  if (m[3]) return a * 60;
  return a <= 10 ? a * 60 : a;
}

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseProgram(text: string, settings: ProgramSettings): { templates: Template[]; warnings: ProgramWarning[] } {
  const templates: Template[] = [];
  const warnings: ProgramWarning[] = [];
  let tpl: Template | null = null;
  let block: (BlockDef & { setsFixed: boolean; restFixed: boolean }) | null = null;

  const closeBlock = () => {
    if (!tpl || !block) return;
    if (!block.exos.length) {
      warnings.push({ kind: "emptyBlock", block: block.label, template: tpl.name });
    } else {
      if (block.kind !== "skill") block.kind = block.exos.length > 1 ? "superset" : "single";
      if (!block.restFixed) block.rest = block.kind === "skill" ? settings.skillRest : settings.defaultRest;
      const { setsFixed: _s, restFixed: _r, ...def } = block;
      tpl.blocks.push(def);
    }
    block = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(">") || line.startsWith("//")) continue;

    const head = line.match(/^#{2,3}\s+(.+)$/);
    if (head) {
      closeBlock();
      const name = head[1].trim();
      const dm = name.match(DAY_HEAD_RE);
      const wd = dm ? dayIndexFromName(dm[1]) : null;
      const title = dm ? (dm[2]?.trim() || name) : name;
      // L'id suit le titre, pas le jour : déplacer ou retirer le jour du titre garde les planifications.
      let id = slug(title) || `template-${templates.length + 1}`;
      while (templates.some((t) => t.id === id)) id += "-2";
      tpl = { id, name, title, weekday: wd, blocks: [] };
      templates.push(tpl);
      continue;
    }
    if (/^#\s/.test(line)) continue; // titre du document
    if (!tpl) continue;

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      let t = bullet[1].trim();
      let target = "";
      const tm = t.match(/\[([^\]]*)\]/);
      if (tm) {
        target = tm[1].trim();
        t = t.replace(tm[0], " ");
      }
      let sets: number | null = null;
      const sm = t.match(/(?:^|\s)(\d+)\s*[x×](?=\s|$)/i);
      if (sm) {
        sets = parseInt(sm[1], 10);
        t = t.replace(sm[0], " ");
      }
      // "Running : 3-4 km facile" → cible après les deux-points.
      if (!target && t.includes(":")) {
        const [n, ...r] = t.split(":");
        t = n;
        target = r.join(":").trim();
      }
      const name = t.replace(/\s{2,}/g, " ").trim();
      // Sans en-tête de bloc, chaque puce est son propre bloc, sans repos.
      const standalone = !block;
      if (!block) {
        block = { label: name, kind: "single", exos: [], sets: sets ?? 1, rest: 0, setsFixed: true, restFixed: true };
      }
      if (sets !== null && !block.setsFixed) {
        block.sets = sets;
        block.setsFixed = true;
      }
      block.exos.push({ name, target });
      if (standalone) closeBlock();
      continue;
    }

    // En-tête de bloc.
    closeBlock();
    const parts = line.split("|").map((p) => p.trim());
    const tag: BlockDef["tag"] = /\b(?:bonus|optional|optionnel)\b/i.test(line) ? "bonus" : /\b(?:noyau|core)\b/i.test(line) ? "core" : undefined;
    const label = parts[0].replace(new RegExp(String.raw`\s*[·•(-]?\s*\(?\b(?:${TAG_WORDS})\b\)?\s*$`, "i"), "").trim() || parts[0];
    const rest = parseRest(line);
    const setsMatch = line.match(/(\d+)\s*(?:tours?|s[ée]ries?|rounds?|sets?)\b/i);
    block = {
      label,
      tag,
      kind: /skill|technique|technical/i.test(label) ? "skill" : "single",
      exos: [],
      sets: setsMatch ? parseInt(setsMatch[1], 10) : 3,
      rest: rest ?? 0,
      setsFixed: !!setsMatch,
      restFixed: rest !== null,
    };
  }
  closeBlock();
  for (const t of templates) if (!t.blocks.length) warnings.push({ kind: "emptyTemplate", template: t.name });
  return { templates: templates.filter((t) => t.blocks.length), warnings };
}

/** Valeur proposée par défaut pour une série : haut de l'objectif, en paire pour un superset. */
export function placeholderFor(block: Pick<BlockDef, "exos">): string {
  const parts = block.exos.map((e) => {
    // Seulement les objectifs chiffrés : "8-10", "8-12s", "5-6 / jambe". Pas "3-4 km, allure facile".
    const m = e.target.match(/^\s*(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|à|to)\s*(\d+(?:[.,]\d+)?))?\s*(s|sec|reps?)?\s*(?:\/\s*(?:jambe|côté|cote|bras|leg|side|arm))?\s*$/i);
    if (!m) return "";
    return (m[2] ?? m[1]) + (m[3] && /^s/i.test(m[3]) ? "s" : "");
  });
  return parts.every(Boolean) ? parts.join("/") : "";
}

const EXAMPLE_FR = `# Programme d'exemple
> Remplace ce texte par ton propre programme. Un titre ## par séance ; commence-le par un jour pour l'associer à ce jour.

## Lundi — Haut du corps
Bloc 1 · skill | repos 2:30
- Hollow hold 3x [30-45s]
Superset A · noyau | 4 tours | repos 1:30
- Tractions [6-8]
- Pompes [12-15]
Superset B · bonus | 3 tours | repos 1:30
- Rowing horizontal [8-12]
- Dips [6-10]

## Mardi — Cardio
- Running : 30 min facile
- Mobilité : 10 min

## Mercredi — Bas du corps
Superset A · noyau | 4 tours | repos 1:30
- Squat bulgare [8-10 / jambe]
- Pont fessier [12-15]
Superset B · bonus | 3 tours | repos 1:30
- Fentes arrière [8 / jambe]
- Gainage latéral [30s]

## Vendredi — Full body
Superset A · noyau | 4 tours | repos 1:30
- Tractions [6-8]
- Squat [12-15]
Superset B · noyau | 3 tours | repos 1:30
- Pompes [12-15]
- Mountain climbers [20]

## Séance courte
Circuit | 3 tours | repos 1:00
- Pompes [10]
- Squat [15]
- Gainage [30s]
`;

const EXAMPLE_EN = `# Example program
> Replace this text with your own program. One ## heading per session; start it with a weekday to plan it on that day.

## Monday — Upper body
Block 1 · skill | rest 2:30
- Hollow hold 3x [30-45s]
Superset A · core | 4 rounds | rest 1:30
- Pull-ups [6-8]
- Push-ups [12-15]
Superset B · bonus | 3 rounds | rest 1:30
- Ring rows [8-12]
- Dips [6-10]

## Tuesday — Cardio
- Running : 30 min easy
- Mobility : 10 min

## Wednesday — Lower body
Superset A · core | 4 rounds | rest 1:30
- Bulgarian split squat [8-10 / leg]
- Glute bridge [12-15]
Superset B · bonus | 3 rounds | rest 1:30
- Reverse lunges [8 / leg]
- Side plank [30s]

## Friday — Full body
Superset A · core | 4 rounds | rest 1:30
- Pull-ups [6-8]
- Squats [12-15]
Superset B · core | 3 rounds | rest 1:30
- Push-ups [12-15]
- Mountain climbers [20]

## Short session
Circuit | 3 rounds | rest 1:00
- Push-ups [10]
- Squats [15]
- Plank [30s]
`;

export const EXAMPLE_PROGRAM: Record<Lang, string> = { fr: EXAMPLE_FR, en: EXAMPLE_EN };
