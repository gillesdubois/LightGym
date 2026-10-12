// Dates locales au format ISO court (YYYY-MM-DD). Semaine du lundi au dimanche.
// Les dates s'écrivent jour d'abord (05/10 = 5 octobre) dans les deux langues.

export type Lang = "fr" | "en";

export const DAYS: Record<Lang, { short: string[]; long: string[]; initial: string[] }> = {
  fr: {
    short: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    long: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
    initial: ["L", "M", "M", "J", "V", "S", "D"],
  },
  en: {
    short: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    long: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    initial: ["M", "T", "W", "T", "F", "S", "S"],
  },
};

export const MONTHS: Record<Lang, string[]> = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 0 = lundi … 6 = dimanche */
export function weekday(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7;
}

export const mondayOf = (iso: string) => addDays(iso, -weekday(iso));

export function ddmm(iso: string): string {
  const d = fromISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function ddmmyyyy(iso: string): string {
  return `${ddmm(iso)}/${fromISO(iso).getFullYear()}`;
}

export const dayLabel = (iso: string, lang: Lang = "fr") => `${DAYS[lang].short[weekday(iso)]} ${ddmm(iso)}`;

export function isoWeek(iso: string): number {
  const d = fromISO(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

// Noms de jours reconnus à la lecture, en français et en anglais.
const DAY_NAMES: Record<string, number> = {
  lun: 0, lundi: 0, mar: 1, mardi: 1, mer: 2, mercredi: 2, jeu: 3, jeudi: 3,
  ven: 4, vendredi: 4, sam: 5, samedi: 5, dim: 6, dimanche: 6,
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};

/** Alternance regex des noms de jours, les plus longs d'abord. */
export const DAY_NAME_PATTERN = Object.keys(DAY_NAMES).sort((a, b) => b.length - a.length).join("|");

export function dayIndexFromName(name: string): number | null {
  const k = name.toLowerCase().replace(/\.$/, "");
  return k in DAY_NAMES ? DAY_NAMES[k] : null;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return toISO(fromISO(iso)) === iso;
}
