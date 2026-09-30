/** Returns '+91XXXXXXXXXX' or null. Never treats a 12-digit run (UTR) as a phone. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/[^\d]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  return /^[6-9]\d{9}$/.test(d) ? '+91' + d : null;
}

export const PHONE_RE = /^\+91[6-9]\d{9}$/;
export const phoneDigits = (e164: string) => e164.replace(/^\+/, '');
export const formatPhone = (e164: string) => `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
