import { businessDayKey, formatZurichTimeRange, getDefaultIntlLocale, zurichDateTimeFormat } from '@schichtplan/shared';

export { businessDayKey };

// Anlässe finden in der Schweiz statt: Zeiten immer in Schweizer Zeit anzeigen,
// auch wenn jemand aus dem Ausland schaut (zurichDateTimeFormat setzt die Zeitzone fest).
// Formatter erst beim Aufruf holen (zwischengespeichert): so gilt die aktive Sprache der Person.
const timeFmt = () => zurichDateTimeFormat({ hour: '2-digit', minute: '2-digit' });
const weekdayFmt = () => zurichDateTimeFormat({ weekday: 'long' });
const shortWeekdayFmt = () => zurichDateTimeFormat({ weekday: 'short' });
const dayMonthFmt = () => zurichDateTimeFormat({ day: 'numeric', month: 'long' });
const shortDateFmt = () => zurichDateTimeFormat({ day: '2-digit', month: '2-digit' });
const fullDateFmt = () => zurichDateTimeFormat({ day: 'numeric', month: 'long', year: 'numeric' });

export const fmtTime = (iso: string) => timeFmt().format(new Date(iso));
/** Zeitspanne einheitlich «18:00–22:00» */
export const fmtTimeRange = (startIso: string, endIso: string) => formatZurichTimeRange(startIso, endIso);
export const fmtWeekday = (iso: string) => weekdayFmt().format(new Date(iso));
export const fmtShortWeekday = (iso: string) => shortWeekdayFmt().format(new Date(iso)).replace('.', '');
export const fmtDayMonth = (iso: string) => dayMonthFmt().format(new Date(iso));
export const fmtShortDate = (iso: string) => shortDateFmt().format(new Date(iso));
export const fmtFullDate = (iso: string) => fullDateFmt().format(new Date(iso));

/** «16.–18. Oktober 2026» bzw. «16. Oktober 2026», in der aktiven Sprache (Intl formatRange) */
export function fmtDateRange(startIso: string, endIso: string, cutoff?: string | null) {
  // Über Geschäftstage mit der Tageswechsel-Uhrzeit des Anlasses, damit ein Ende um 00:30 nicht als Folgetag erscheint
  const start = dayKeyToIso(businessDayKey(startIso, cutoff));
  const end = dayKeyToIso(businessDayKey(endIso, cutoff));
  if (start === end) return fmtFullDate(start);
  return fullDateFmt().formatRange(new Date(start), new Date(end));
}

/** Anzeigename einer Schicht: der Titel, oder die Zeitspanne wenn keiner gesetzt ist (Titel sind optional) */
export const shiftName = (s: { title?: string | null; startTime: string; endTime: string }) =>
  s.title?.trim() || fmtTimeRange(s.startTime, s.endTime);

/** Dauer als "4 h" bzw. "4 h 30" */
export function fmtDuration(startIso: string, endIso: string) {
  const minutes = Math.max(0, Math.round((+new Date(endIso) - +new Date(startIso)) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export const hoursBetween = (startIso: string, endIso: string) =>
  Math.max(0, (+new Date(endIso) - +new Date(startIso)) / 3_600_000);

/** ISO-Zeitpunkt mittags am Geschäftstag – für Wochentag-/Datumslabels. */
export const dayKeyToIso = (key: string) => `${key}T12:00:00Z`;

export function groupByBusinessDay<T extends { startTime: string }>(items: T[], cutoff?: string | null) {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))) {
    const key = businessDayKey(item.startTime, cutoff);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }));
}

/** "heute", "morgen", "in 5 Tagen", "vor 2 Tagen" */
export function fmtRelativeDay(iso: string, now = new Date()) {
  const diff = Math.round(
    (Date.parse(businessDayKey(iso)) - Date.parse(businessDayKey(now.toISOString()))) / 86_400_000
  );
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  return diff > 0 ? `in ${diff} Tagen` : `vor ${-diff} Tagen`;
}

/** Stand der Offline-Daten: «Heute, 14:32 Uhr», «Gestern, 09:15 Uhr» oder «25.10., 14:32 Uhr» (in der aktiven Sprache) */
export function fmtStand(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const time = timeFmt().format(date);
  const diff = Math.round(
    (Date.parse(businessDayKey(date.toISOString())) - Date.parse(businessDayKey(now.toISOString()))) / 86_400_000
  );
  const locale = getDefaultIntlLocale();
  // «Uhr» nur im Deutschen, in den anderen Sprachen steht die Uhrzeit allein
  const clock = locale.startsWith('de') ? `${time} Uhr` : time;
  if (diff === 0 || diff === -1) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day');
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${clock}`;
  }
  return `${shortDateFmt().format(date)}, ${clock}`;
}

export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();
