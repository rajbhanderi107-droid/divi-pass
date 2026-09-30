export const IST = 'Asia/Kolkata';

function parts(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

/** 'YYYY-MM-DD' for the IST calendar day of an instant. */
export function istDate(ms: number = Date.now()): string {
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

export function istTime(ms: number): string {
  const p = parts(ms);
  return `${p.hour}:${p.minute}`;
}

/** Epoch ms for a wall-clock time in IST (IST is a fixed +05:30 offset). */
export function istToEpoch(date: string, hh = 0, mm = 0): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, hh, mm) - 330 * 60_000;
}

export function isValidDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function weekdayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const s = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `${s}, ${weekdayName(date).slice(0, 3)}`;
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(ms));
}
