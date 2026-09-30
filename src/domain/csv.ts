/** Escape one CSV cell. Cells starting with = + - @ are prefixed so Excel never runs them as formulas. */
export function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows: (string | number | undefined | null)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
