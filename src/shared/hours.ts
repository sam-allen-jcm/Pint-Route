// Opening-hours maths for "will this pub be open when we get there?".
// All times are local wall-clock times at the venue (which is how Google gives
// opening hours), so no timezone conversion is needed.

export interface HoursPoint {
  day: number; // 0 = Sunday … 6 = Saturday
  hour: number;
  minute: number;
  date?: { year: number; month: number; day: number };
}

export interface HoursPeriod {
  open: HoursPoint;
  /** Missing close = open 24 hours. */
  close?: HoursPoint;
}

export interface OpeningHours {
  /** The usual weekly pattern. */
  regular: HoursPeriod[];
  /** Actual hours for the next 7 days, with dates (includes holidays/special days). */
  current: HoursPeriod[];
}

/** A local date and time, e.g. { date: "2026-11-02", minutes: 19 * 60 }. Minutes may exceed a day. */
export interface LocalTime {
  date: string; // YYYY-MM-DD
  minutes: number; // minutes after midnight on `date`
}

export type OpenStatus =
  | { open: true; closesAt: LocalTime | null; closingSoon: boolean }
  | { open: false; opensAt: LocalTime | null };

const DAY = 1440;

/** Days since 1970-01-01 for a YYYY-MM-DD date. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function dateFromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** Normalises minutes ≥ 1440 into the following days. */
export function normalise(t: LocalTime): LocalTime {
  const extraDays = Math.floor(t.minutes / DAY);
  return { date: dateFromDayNumber(dayNumber(t.date) + extraDays), minutes: t.minutes - extraDays * DAY };
}

export function addMinutes(t: LocalTime, minutes: number): LocalTime {
  return normalise({ date: t.date, minutes: t.minutes + minutes });
}

/** Absolute minute number (since 1970) of a local time. */
const abs = (t: LocalTime) => dayNumber(t.date) * DAY + t.minutes;
const fromAbs = (n: number): LocalTime => normalise({ date: dateFromDayNumber(0), minutes: n });

/** Opening intervals [open, close) as absolute minutes covering the week around `at`. */
function intervals(hours: OpeningHours, at: LocalTime): [number, number][] {
  const target = abs(at);
  const atDay = dayNumber(at.date);

  // Prefer the dated hours when they cover the day in question.
  const dated = hours.current.filter((p) => p.open.date);
  const datedDays = dated.map((p) => dayNumber(pointDate(p.open)!));
  if (dated.length && atDay >= Math.min(...datedDays) && atDay <= Math.max(...datedDays)) {
    return dated.map((p) => {
      const open = dayNumber(pointDate(p.open)!) * DAY + p.open.hour * 60 + p.open.minute;
      const close = p.close?.date
        ? dayNumber(pointDate(p.close)!) * DAY + p.close.hour * 60 + p.close.minute
        : open + DAY * 7;
      return [open, close <= open ? close + DAY : close];
    });
  }

  // Otherwise repeat the usual weekly pattern for the weeks around the target.
  const weekStart = atDay - weekday(at.date); // the Sunday on or before `at`
  const out: [number, number][] = [];
  for (const week of [-7, 0, 7]) {
    for (const p of hours.regular) {
      const open = (weekStart + week + p.open.day) * DAY + p.open.hour * 60 + p.open.minute;
      if (!p.close) {
        out.push([target - DAY * 7, target + DAY * 7]); // open 24/7
        continue;
      }
      let close = (weekStart + week + p.close.day) * DAY + p.close.hour * 60 + p.close.minute;
      if (close <= open) close += DAY * 7; // wraps past Saturday night
      out.push([open, close]);
    }
  }
  return out;
}

function pointDate(p: HoursPoint): string | null {
  if (!p.date) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.date.year}-${pad(p.date.month)}-${pad(p.date.day)}`;
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string): number {
  return ((dayNumber(date) % 7) + 4 + 7) % 7; // 1970-01-01 was a Thursday
}

/** Whether a venue is open at a local time, with when it closes/opens. Null if hours are unknown. */
export function statusAt(hours: OpeningHours | null, when: LocalTime, soonMinutes = 45): OpenStatus | null {
  if (!hours || (!hours.regular.length && !hours.current.length)) return null;
  const t = abs(normalise(when));
  const list = intervals(hours, normalise(when));
  const now = list.find(([o, c]) => t >= o && t < c);
  if (now) {
    const always = now[1] - now[0] >= DAY * 7;
    return {
      open: true,
      closesAt: always ? null : fromAbs(now[1]),
      closingSoon: !always && now[1] - t <= soonMinutes,
    };
  }
  const next = list.filter(([o]) => o > t).sort((a, b) => a[0] - b[0])[0];
  return { open: false, opensAt: next ? fromAbs(next[0]) : null };
}

let uses12h: boolean | null = null;

/** "7:30 PM" or "19:30", following the user's locale (24-hour times keep the leading zero: "00:30"). */
export function formatClock(t: LocalTime): string {
  uses12h ??= new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false;
  const m = ((t.minutes % DAY) + DAY) % DAY;
  return new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60)).toLocaleTimeString(undefined, {
    hour: uses12h ? "numeric" : "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** "Sat 2 Nov" */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Parses "YYYY-MM-DDTHH:MM" (a crawl's start). */
export function parseStart(startsAt: string | null): LocalTime | null {
  const m = startsAt?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  return m ? { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) } : null;
}
