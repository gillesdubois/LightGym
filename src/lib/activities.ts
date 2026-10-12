// Activités hors séance (vélo, running, escalade…) : type, durée et distance lus dans le texte.

export interface Activity {
  id: string;
  type: string;
  label: string;
  durationMin?: number;
  distanceKm?: number;
}

export const ACTIVITY_TYPES = [
  "Vélotaf", "Vélo", "Gravel", "Running", "Rando", "Escalade", "Yoga",
  "Mobilité", "Corde", "HIIT", "Handstand", "Marche", "Autre",
];

const TYPES: [RegExp, string][] = [
  [/v[ée]lo\s*-?\s*taf|v[ée]lotaf/i, "Vélotaf"],
  [/gravel/i, "Gravel"],
  [/v[ée]lo|bike|cyclisme/i, "Vélo"],
  [/running|footing|jogging|course à pied|\brun\b/i, "Running"],
  [/\brando|randonn/i, "Rando"],
  [/escalade|grimpe/i, "Escalade"],
  [/yoga/i, "Yoga"],
  [/mobilit|[ée]tirement|stretching|souplesse/i, "Mobilité"],
  [/corde/i, "Corde"],
  [/hiit|tabata|emom/i, "HIIT"],
  [/handstand/i, "Handstand"],
  [/marche|balade/i, "Marche"],
];

/** Le texte décrit-il une activité (et pas une série d'exercice) ? */
export function looksLikeActivity(text: string): boolean {
  if (/\[|(?:^|\s)\d+\s*[x×]\s/.test(text)) return false;
  return TYPES.some(([re]) => re.test(text));
}

export function detectType(text: string): string {
  for (const [re, type] of TYPES) if (re.test(text)) return type;
  return "Autre";
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
  const heure = text.match(/(\d+)\s*heures?/i);
  if (heure) return parseInt(heure[1], 10) * 60;
  const min = text.match(/(\d+)\s*(?:min|minutes?|mn)\b/i);
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

export const isCycling = (type: string) => /v[ée]lo|gravel/i.test(type);
