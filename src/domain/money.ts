export type Rupees = number;

export function assertRupees(n: number, label = 'amount'): Rupees {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a whole number of rupees`);
  return n;
}

export const formatINR = (n: Rupees) => '₹' + new Intl.NumberFormat('en-IN').format(n);

/** Parse "₹1,300", "Rs. 2600/-", "3.25k", "1300 rs" → whole rupees, or null. */
export function parseRupees(input: string): Rupees | null {
  const s = input.toLowerCase().replace(/,/g, '').replace(/₹|rs\.?|inr|\/-/g, ' ').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(k)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]!) * (m[2] ? 1000 : 1);
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? r : null;
}
