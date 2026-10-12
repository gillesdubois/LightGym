// Programme écrit en texte, transformé en gabarits de séance.
//
//   ## Lundi — Pull / Front lever
//   Bloc 1 · skill | repos 2:30
//   - Front lever one-leg 5x [8-12s]
//   Superset A · noyau | 4 tours | repos 1:30
//   - Tractions strictes [8-10]
//   - Swing KB 20 kg [15]
//
// Un titre sans jour ("## Séance légère") donne un gabarit disponible n'importe quel jour.

import { dayIndexFromName } from "./dates";

export interface ExoDef {
  name: string;
  target: string;
}

export interface BlockDef {
  label: string;
  tag?: "noyau" | "bonus";
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

const DAY_HEAD_RE =
  /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\.?(?:\s*(?:[—–:-]+)\s*(.*))?$/i;

function parseRest(text: string): number | null {
  const m = text.match(/repos\s*(\d+)\s*(?::\s*(\d{1,2}))?\s*(min|mn|s|sec)?/i);
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

export function parseProgram(text: string, settings: ProgramSettings): { templates: Template[]; warnings: string[] } {
  const templates: Template[] = [];
  const warnings: string[] = [];
  let tpl: Template | null = null;
  let block: (BlockDef & { setsFixed: boolean; restFixed: boolean }) | null = null;

  const closeBlock = () => {
    if (!tpl || !block) return;
    if (!block.exos.length) {
      warnings.push(`« ${block.label} » (${tpl.name}) ne contient aucun exercice.`);
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
      let id = slug(name) || `gabarit-${templates.length + 1}`;
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
    const tag: BlockDef["tag"] = /\bbonus\b/i.test(line) ? "bonus" : /\bnoyau\b/i.test(line) ? "noyau" : undefined;
    const label = parts[0].replace(/\s*[·•(-]?\s*\(?\b(?:bonus|noyau)\b\)?\s*$/i, "").trim() || parts[0];
    const rest = parseRest(line);
    const setsMatch = line.match(/(\d+)\s*(?:tours?|s[ée]ries?)\b/i);
    block = {
      label,
      tag,
      kind: /skill|technique/i.test(label) ? "skill" : "single",
      exos: [],
      sets: setsMatch ? parseInt(setsMatch[1], 10) : 3,
      rest: rest ?? 0,
      setsFixed: !!setsMatch,
      restFixed: rest !== null,
    };
  }
  closeBlock();
  for (const t of templates) if (!t.blocks.length) warnings.push(`« ${t.name} » ne contient aucun bloc.`);
  return { templates: templates.filter((t) => t.blocks.length), warnings };
}

/** Valeur proposée par défaut pour une série : haut de l'objectif, en paire pour un superset. */
export function placeholderFor(block: Pick<BlockDef, "exos">): string {
  const parts = block.exos.map((e) => {
    // Seulement les objectifs chiffrés : "8-10", "8-12s", "5-6 / jambe". Pas "3-4 km, allure facile".
    const m = e.target.match(/^\s*(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|à)\s*(\d+(?:[.,]\d+)?))?\s*(s|sec|reps?)?\s*(?:\/\s*(?:jambe|côté|cote|bras))?\s*$/i);
    if (!m) return "";
    return (m[2] ?? m[1]) + (m[3] && /^s/i.test(m[3]) ? "s" : "");
  });
  return parts.every(Boolean) ? parts.join("/") : "";
}

export const EXAMPLE_PROGRAM = `# Programme d'exemple
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
