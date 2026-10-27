// Date helpers. All dates in this app are plain "YYYY-MM-DD" strings, so there
// are no time zone surprises. "Today" is computed in the configured time zone.

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const d = toUTC(value);
  return fromUTC(d) === value;
}

export function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTC(d: Date): ISODate {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayInTimeZone(timeZone = 'America/Chicago', now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Adds calendar months, clamping to the last day of the month (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = toUTC(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromUTC(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** Monday of the week containing the date. */
export function weekStart(date: ISODate): ISODate {
  const dow = toUTC(date).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return addDays(date, -back);
}

export function weekEnd(date: ISODate): ISODate {
  return addDays(weekStart(date), 6);
}

export function monthStart(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function inRange(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDate(date: ISODate | null | undefined, withYear = true): string {
  if (!date) return '';
  const d = toUTC(date);
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base;
}

export function formatDateLong(date: ISODate): string {
  const d = toUTC(date);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatMonth(date: ISODate): string {
  const d = toUTC(date);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatWeekRange(start: ISODate): string {
  const end = addDays(start, 6);
  const s = toUTC(start);
  const e = toUTC(end);
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${formatDate(start, false)} to ${formatDate(end, false)}, ${e.getUTCFullYear()}`;
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
}

/** "3 weeks ago", "today", "in 5 days" style text for a gap measured in days. */
export function describeGap(days: number): string {
  const abs = Math.abs(days);
  if (abs === 0) return 'today';
  const unit = abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} day${abs === 1 ? '' : 's'}`;
  return days > 0 ? `${unit} ago` : `in ${unit}`;
}
