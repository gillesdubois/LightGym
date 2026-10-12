// Activités hors séance (vélo, running, escalade…) : type, durée et distance lus dans le texte.
// Le type est une clé neutre ; son libellé vient de la langue de l'interface.

export interface Activity {
  id: string;
  type: string;
  label: string;
  durationMin?: number;
  distanceKm?: number;
}

export const ACTIVITY_TYPES = [
  "commute", "bike", "gravel", "run", "hike", "climb", "yoga",
  "mobility", "rope", "hiit", "handstand", "walk", "other",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Anciennes sauvegardes : types stockés en libellé français. */
export const LEGACY_TYPES: Record<string, ActivityType> = {
  "Vélotaf": "commute", "Vélo": "bike", "Gravel": "gravel", "Running": "run", "Rando": "hike",
  "Escalade": "climb", "Yoga": "yoga", "Mobilité": "mobility", "Corde": "rope", "HIIT": "hiit",
  "Handstand": "handstand", "Marche": "walk", "Autre": "other",
};

const TYPES: [RegExp, ActivityType][] = [
  [/v[ée]lo\s*-?\s*taf|v[ée]lotaf|\bcommute|bike to work/i, "commute"],
  [/gravel/i, "gravel"],
  [/v[ée]lo|bike|cycling|\bride\b|cyclisme/i, "bike"],
  [/running|footing|jogging|\bjog\b|course à pied|\brun\b/i, "run"],
  [/\brando|randonn|\bhike|hiking/i, "hike"],
  [/escalade|grimpe|climb|boulder/i, "climb"],
  [/yoga/i, "yoga"],
  [/mobilit|[ée]tirement|stretch|souplesse/i, "mobility"],
  [/corde|jump rope|skipping/i, "rope"],
  [/hiit|tabata|emom/i, "hiit"],
  [/handstand/i, "handstand"],
  [/marche|balade|\bwalk/i, "walk"],
];

/** Le texte décrit-il une activité (et pas une série d'exercice) ? */
export function looksLikeActivity(text: string): boolean {
  if (/\[|(?:^|\s)\d+\s*[x×]\s/.test(text)) return false;
  return TYPES.some(([re]) => re.test(text));
}

export function detectType(text: string): ActivityType {
  for (const [re, type] of TYPES) if (re.test(text)) return type;
  return "other";
}

export function parseDistanceKm(text: string): number | undefined {
  const mult = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*km/i);
  if (mult) return parseInt(mult[1], 10) * parseFloat(mult[2].replace(",", "."));
  const km = text.match(/(\d+(?:[.,]\d+)?)\s*km/i);
  return km ? parseFloat(km[1].replace(",", ".")) : undefined;
}

export function parseDurationMin(text: string): number | undefined {
  const hm = text.match(/(\d+)\s*h\s*(\d{1,2})?(?!\w)/i);
  if (hm) return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
  const heure = text.match(/(\d+)\s*(?:heures?|hours?|hrs?)\b/i);
  if (heure) return parseInt(heure[1], 10) * 60;
  const min = text.match(/(\d+)\s*(?:min|minutes?|mn|mins)\b/i);
  return min ? parseInt(min[1], 10) : undefined;
}

export function activityFromText(text: string, id: string): Activity {
  const label = text.trim().replace(/^[*\-•]\s*/, "");
  return {
    id,
    type: detectType(label),
    label,
    durationMin: parseDurationMin(label),
    distanceKm: parseDistanceKm(label),
  };
}

export function paceLabel(durationMin?: number, distanceKm?: number): string | null {
  if (!durationMin || !distanceKm) return null;
  const pace = durationMin / distanceKm;
  if (!isFinite(pace) || pace <= 0) return null;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return s === 60 ? `${m + 1}:00/km` : `${m}:${String(s).padStart(2, "0")}/km`;
}

export const isCycling = (type: string) => type === "bike" || type === "gravel" || type === "commute";
export const isPaced = (type: string) => type === "run" || type === "hike" || type === "walk";
