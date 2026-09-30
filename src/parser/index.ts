import { normalizePhone } from '../domain/phone';
import { parseRupees } from '../domain/money';
import { computeTotal } from '../domain/status';
import { IST, isValidDate, istDate, istToEpoch, weekdayName, ymd } from '../domain/time';

export type Conf = 'H' | 'M' | 'L';
export interface DraftLine { kind: 'solo' | 'couple' | 'unknown'; qty: number }
export interface Draft {
  kind: 'sale' | 'payment' | 'mixed';
  name?: string; phone?: string; altPhones: string[]; lines: DraftLine[]; eventDate?: string;
  amounts: number[]; total?: number; utr?: string; party?: { role: 'paidTo' | 'receivedFrom'; name: string };
  paidAt?: number; sourceText: string; sourceHash: string; confidence: Record<string, Conf>; warnings: string[];
}
export interface ParseOptions {
  today?: string;                       // 'YYYY-MM-DD' IST, defaults to now
  season?: { from: string; to: string };
  prices?: { solo: number; couple: number }; // for the amount cross-check
}

const DIGITS: Record<string, string> = {};
'०१२३४५६७८९'.split('').forEach((c, i) => (DIGITS[c] = String(i)));
'૦૧૨૩૪૫૬૭૮૯'.split('').forEach((c, i) => (DIGITS[c] = String(i)));

const WORD_NUM: Record<string, number> = {
  ek: 1, one: 1, do: 2, be: 2, two: 2, teen: 3, tran: 3, three: 3, char: 4, four: 4, panch: 5, paanch: 5, five: 5,
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS: Record<string, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

const L = {
  name: '(?:name|naam|nam|નામ|नाम)',
  phone: '(?:number|no|mobile|mob|mo|ph|phone|contact|નંબર|नंबर|नम्बर)',
  pass: '(?:passes|pass|tickets?|પાસ|पास)',
  date: '(?:date|day|night|તારીખ|तारीख)',
};
const SEP = '\\s*[:;\\-–=]';
const RE_NAME = new RegExp(`^\\s*${L.name}${SEP}\\s*(.*)$`, 'iu');
const RE_PHONE = new RegExp(`^\\s*${L.phone}${SEP}\\s*(.*)$`, 'iu');
const RE_PASS = new RegExp(`^\\s*${L.pass}${SEP}\\s*(.*)$`, 'iu');
const RE_DATE = new RegExp(`^\\s*${L.date}\\s*[:;\\-–=]?\\s*(\\S.*)$`, 'iu');
const RE_HEADER = /divya\s+achariya\s+divi/i;
const RE_PREFIX_A = /^\[[^\]]+\]\s*[^:\n]*:\s*/;
const RE_PREFIX_B = /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?\s*-\s*[^:\n]*:\s*/i;

const KIND = '(solos?|singles?|stag|couples?|cpl|pairs?|jodi)';
const QTY = '(\\d+|ek|do|be|teen|tran|char|panch|paanch|one|two|three|four|five)';
const kindOf = (w: string): 'solo' | 'couple' => (/^(solo|single|stag)/i.test(w) ? 'solo' : 'couple');

export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[०-९૦-૯]/g, (c) => DIGITS[c] ?? c)
    .replace(/\r/g, '')
    .replace(/[ ‎‏]/g, ' ')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/[*_~]/g, '');
}

const titleCase = (s: string) =>
  s.replace(/[.,;:!]+$/, '').trim().split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

export function parsePassText(s: string): { items: { kind: 'solo' | 'couple'; qty: number; explicit: boolean }[]; rest: string } {
  const re = new RegExp(`(?<![A-Za-z])(?:${QTY}\\s*[x×]?\\s*)?${KIND}\\b(?:\\s*[x×]\\s*(\\d+))?`, 'gi');
  const items: { kind: 'solo' | 'couple'; qty: number; explicit: boolean }[] = [];
  const rest = s.replace(re, (_m, q1: string | undefined, k: string, q2: string | undefined) => {
    const q = q1 ?? q2;
    const qty = q === undefined ? 1 : /^\d+$/.test(q) ? parseInt(q, 10) : (WORD_NUM[q.toLowerCase()] ?? 1);
    items.push({ kind: kindOf(k), qty, explicit: q !== undefined });
    return ' ';
  });
  return { items, rest };
}

interface DateHit { date: string; conf: Conf; warnings: string[] }
export function parseDateText(value: string, today: string, season?: ParseOptions['season']): DateHit | null {
  const v = value.toLowerCase();
  let d: number, m: number, y: number | undefined;
  const a = v.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTHS.join('|')})[a-z]*\\.?(?:,?\\s*(\\d{4}))?`));
  const b = v.match(/(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/);
  if (a) { d = +a[1]!; m = MONTHS.indexOf(a[2]!) + 1; y = a[3] ? +a[3] : undefined; }
  else if (b) { d = +b[1]!; m = +b[2]!; y = b[3] ? (b[3].length === 2 ? 2000 + +b[3] : +b[3]) : undefined; }
  else return null;
  const warnings: string[] = [];
  const todayY = +today.slice(0, 4);
  let year = y ?? todayY;
  if (!isValidDate(year, m, d)) return null;
  if (y === undefined && ymd(year, m, d) < today) {
    year += 1;
    if (!isValidDate(year, m, d)) return null;
    warnings.push(`year-assumed:${year}`);
  }
  const date = ymd(year, m, d);
  const wd = v.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*/);
  if (wd) {
    const actual = weekdayName(date);
    if (!actual.toLowerCase().startsWith(wd[1]!)) warnings.push(`weekday-mismatch:${WEEKDAYS[wd[1]!]}≠${actual}`);
  }
  let conf: Conf = 'H';
  if (season && (date < season.from || date > season.to)) { warnings.push('out-of-season'); conf = 'M'; }
  return { date, conf, warnings };
}

function scanPhones(text: string, labelled: boolean) {
  const phones: string[] = []; const invalid: string[] = []; let utr: string | undefined;
  for (const m of text.matchAll(/\+?\d[\d\s-]{8,16}\d/g)) {
    const raw = m[0].trim();
    if (!labelled && !raw.startsWith('+') && /^\d{12}$/.test(raw)) { utr ??= raw; continue; }
    const p = normalizePhone(raw);
    if (p) { if (!phones.includes(p)) phones.push(p); }
    else if (labelled) invalid.push(raw.replace(/\D/g, ''));
  }
  return { phones, invalid, utr };
}

const RE_UTR_KEY = /(?:utr|upi\s+transaction\s+id|upi\s+ref(?:erence)?(?:\s*no\.?)?|ref(?:erence)?\s*no\.?)\s*[:\-]?\s*(\d{12})(?!\d)/i;
const RE_PAID_TO = /paid(?:\s+(?:₹|rs\.?)\s*[\d,.]+)?\s+to\s+([A-Za-z][A-Za-z.' ]*?)(?=\s+\d|\s+(?:on|at|upi|utr|ref|transaction)\b|\s*[,₹]|\s*$)/i;
const RE_RECEIVED = /received\s+from\s+([A-Za-z][A-Za-z.' ]*?)(?=\s+\d|\s*[,₹]|\s+(?:on|at|upi|utr|ref|transaction|rs)\b|\s*$)/i;
const RE_STAMP = /(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4}),?\s*(?:at\s+)?(\d{1,2}):(\d{2})\s*([ap]m)?\s*(utc|gmt|ist)?/i;
const RE_RUPEE = /(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)/gi;

function paidAtFrom(m: RegExpMatchArray): number | undefined {
  const mon = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1;
  if (!mon) return undefined;
  let h = +m[4]!; const min = +m[5]!; const ap = m[6]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  const day = ymd(+m[3]!, mon, +m[1]!);
  if (!isValidDate(+m[3]!, mon, +m[1]!)) return undefined;
  const zone = m[7]?.toLowerCase();
  return zone === 'utc' || zone === 'gmt' ? Date.UTC(+m[3]!, mon - 1, +m[1]!, h, min) : istToEpoch(day, h, min);
}

function stripAmountWords(line: string) {
  return line.replace(/^\s*(?:total|paid|amount|amt|rs\.?|₹)\s*[:\-]?\s*/i, '').replace(/\s*(?:paid|done)\s*$/i, '').trim();
}
const hasMarker = (line: string) => /^\s*(?:total|paid|amount|amt|rs\.?|₹)/i.test(line) || /(?:rs\.?|inr|\/-)\s*$/i.test(line);

function splitBlocks(text: string): string[][] {
  const blocks: string[][] = []; let cur: string[] = []; let hasName = false;
  const flush = () => { if (cur.length) blocks.push(cur); cur = []; hasName = false; };
  for (let line of text.split('\n')) {
    line = line.replace(RE_PREFIX_A, '').replace(RE_PREFIX_B, '');
    if (!line.trim()) { flush(); continue; }
    if (RE_HEADER.test(line)) { flush(); continue; }
    if (RE_NAME.test(line)) { if (hasName) flush(); hasName = true; }
    cur.push(line.trim());
  }
  flush();
  return blocks;
}

function parseBlock(lines: string[], opt: Required<Pick<ParseOptions, 'today'>> & ParseOptions): Draft | null {
  const d: Draft = { kind: 'sale', altPhones: [], lines: [], amounts: [], sourceText: lines.join('\n'), sourceHash: '', confidence: {}, warnings: [] };
  let chain: number | undefined; let explicitTotal: number | undefined; let sawSale = false;
  const addPhones = (ph: string[], conf: Conf) => {
    if (!ph.length) return;
    if (!d.phone) { d.phone = ph[0]; d.confidence.phone = conf; }
    for (const p of ph.slice(d.phone === ph[0] ? 1 : 0)) if (p !== d.phone && !d.altPhones.includes(p)) d.altPhones.push(p);
  };
  const addPass = (v: string, label: boolean) => {
    if (label && /^\d+$/.test(v.trim())) { d.lines.push({ kind: 'unknown', qty: +v.trim() }); d.confidence.lines = 'L'; d.warnings.push('pass-kind-unknown'); return; }
    const { items } = parsePassText(v);
    for (const it of items) {
      d.lines.push({ kind: it.kind, qty: it.qty });
      d.confidence.lines = it.explicit && d.confidence.lines !== 'M' ? 'H' : 'M';
    }
  };

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(RE_NAME))) {
      sawSale = true; const n = titleCase(m[1]!); if (n) { d.name = n; d.confidence.name = 'H'; } continue;
    }
    if ((m = line.match(RE_PHONE))) {
      sawSale = true; const r = scanPhones(m[1]!, true);
      addPhones(r.phones, 'H');
      for (const bad of r.invalid) d.warnings.push(`invalid-phone:${bad}`);
      if (r.phones.length > 1) d.warnings.push('multiple-phones');
      continue;
    }
    if ((m = line.match(RE_PASS))) { sawSale = true; if (m[1]!.trim()) addPass(m[1]!, true); continue; }
    if ((m = line.match(RE_DATE)) && parseDateText(m[1]!, opt.today, opt.season)) {
      sawSale = true; const r = parseDateText(m[1]!, opt.today, opt.season)!;
      d.eventDate = r.date; d.confidence.eventDate = r.conf; d.warnings.push(...r.warnings); continue;
    }

    // payment-ish lines
    let pay = false;
    const u = line.match(RE_UTR_KEY); if (u) { d.utr ??= u[1]; pay = true; }
    const pt = line.match(RE_PAID_TO); if (pt) { d.party ??= { role: 'paidTo', name: titleCase(pt[1]!) }; pay = true; }
    const rf = line.match(RE_RECEIVED); if (rf) { d.party ??= { role: 'receivedFrom', name: titleCase(rf[1]!) }; pay = true; }
    const st = line.match(RE_STAMP); if (st) { const t = paidAtFrom(st); if (t !== undefined) { d.paidAt ??= t; pay = true; } }
    const rupees = [...line.matchAll(RE_RUPEE)].map((x) => parseRupees(x[1]!));
    if (!pay && !rupees.length && /\+/.test(line)) {
      const parts = stripAmountWords(line).split('+').map((p) => parseRupees(p.trim()));
      if (parts.length >= 2 && parts.every((p) => p !== null)) {
        const nums = parts as number[]; d.amounts.push(...nums); chain = nums.reduce((a, b) => a + b, 0); continue;
      }
    }
    if (rupees.length) {
      const nums = rupees.filter((x): x is number => x !== null);
      if (nums.length > 1 && /\+/.test(line)) chain = nums.reduce((a, b) => a + b, 0);
      d.amounts.push(...nums); pay = true;
    }
    if (pay) continue;

    const pass = parsePassText(line);
    if (pass.items.length && !pass.rest.replace(/and|[\s+,&]/gi, '')) { sawSale = true; addPass(line, false); continue; }

    const bare = stripAmountWords(line); const v = parseRupees(bare);
    if (v !== null && (hasMarker(line) || v >= 100) && bare.replace(/\D/g, '').length < 8) {
      d.amounts.push(v); if (/^\s*total/i.test(line)) explicitTotal = v; continue;
    }
    const sp = scanPhones(line, false);
    if (sp.utr) { d.utr ??= sp.utr; continue; }
    if (sp.phones.length) { sawSale = true; addPhones(sp.phones, 'M'); }
  }

  const hasPay = !!(d.utr || d.party || d.paidAt);
  const hasSale = sawSale || !!(d.name || d.phone || d.lines.length || d.eventDate);
  if (!hasSale && !hasPay && !d.amounts.length) return null;
  d.total = chain ?? explicitTotal ?? (d.amounts.length === 1 ? d.amounts[0] : undefined);
  d.kind = hasSale ? (hasPay ? 'mixed' : 'sale') : 'payment';
  finish(d, opt);
  return d;
}

function finish(d: Draft, opt: ParseOptions) {
  d.kind = d.name || d.phone || d.lines.length || d.eventDate ? (d.utr || d.party || d.paidAt ? 'mixed' : 'sale') : 'payment';
  if (d.kind !== 'payment') {
    if (!d.eventDate) d.warnings.push('no-date');
    const p = opt.prices;
    if (p && d.total !== undefined && d.lines.length && d.lines.every((l) => l.kind !== 'unknown')) {
      const exp = computeTotal(d.lines.map((l) => ({ qty: l.qty, unitPriceSnap: p[l.kind as 'solo' | 'couple'] })), 0);
      if (exp !== d.total) d.warnings.push(`amount-mismatch:expected ${exp}`);
    }
  }
  d.sourceHash = hashText(d.sourceText.toLowerCase().replace(/\s+/g, ' '));
}

export function parseMessage(text: string, options: ParseOptions = {}): Draft[] {
  const opt = { ...options, today: options.today ?? istDate() };
  const drafts: Draft[] = [];
  for (const b of splitBlocks(normalize(text))) {
    const d = parseBlock(b, opt);
    if (!d) continue;
    const prev = drafts[drafts.length - 1];
    if (d.kind === 'payment' && prev && prev.kind !== 'payment' && !prev.utr && !prev.paidAt) {
      prev.amounts.push(...d.amounts);
      prev.total ??= d.total; prev.utr = d.utr; prev.party = d.party; prev.paidAt = d.paidAt;
      prev.sourceText += '\n' + d.sourceText;
      finish(prev, opt);
    } else drafts.push(d);
  }
  return drafts;
}

export { IST };
