import type { Draft } from '../parser';
import type { EventNight, PassType, Receiver } from './types';
import { priceFor } from './pricing';

export interface PayPlan { amount: number; utr: string; receiverId: string; method: 'upi' | 'cash'; paidAt?: number }
export interface DraftPlan {
  eventId?: string; qty: Record<string, number>; phone: string; name: string; pays: PayPlan[];
  warnings: string[]; base: number; autoOk: boolean; whyNot: string[];
}

interface Ctx { passTypes: PassType[]; events: EventNight[]; receivers: Receiver[]; lastReceiverId: string; fromPhoto: boolean }

/** Turn a parsed draft into form values, and decide whether it is clear enough to save without a review. */
export function planFromDraft(d: Draft, c: Ctx): DraftPlan {
  const warnings = [...d.warnings]; const whyNot: string[] = [];
  const ev = d.eventDate ? c.events.find((e) => e.date === d.eventDate) : undefined;
  if (d.eventDate && !ev) warnings.push(`Night ${d.eventDate} is not in your nights list — pick one below.`);

  const qty: Record<string, number> = {}; let unresolved = false;
  for (const l of d.lines) {
    const pt = l.kind === 'unknown' ? undefined : c.passTypes.find((p) => p.active && p.kind === l.kind);
    if (pt) qty[pt.id] = (qty[pt.id] ?? 0) + l.qty; else unresolved = true;
  }
  if (unresolved && !warnings.includes('pass-kind-unknown')) warnings.push('pass-kind-unknown');
  const base = c.passTypes.reduce((s, p) => s + (qty[p.id] ?? 0) * priceFor(p, ev), 0);
  const passCount = Object.values(qty).reduce((a, b) => a + b, 0);

  const rc = (n?: string) => (n ? c.receivers.find((r) => r.nameLower === n.toLowerCase())?.id : undefined) ?? c.lastReceiverId;
  const pays: PayPlan[] = [];
  if (d.utr && d.total) pays.push({ amount: d.total, utr: d.utr, receiverId: rc(d.party?.role === 'paidTo' ? d.party.name : undefined), method: 'upi', paidAt: d.paidAt });
  else if (!d.utr && d.amounts.length > 1) for (const a of d.amounts) pays.push({ amount: a, utr: '', receiverId: c.lastReceiverId, method: 'upi' });
  else if (!d.utr && d.total && (d.party || d.paidAt || (c.fromPhoto && d.total === base)))
    pays.push({ amount: d.total, utr: '', receiverId: rc(d.party?.role === 'paidTo' ? d.party.name : undefined), method: 'upi', paidAt: d.paidAt });

  if (d.kind === 'payment') whyNot.push('payment only');
  if (!d.phone) whyNot.push('phone');
  if (!d.lines.length || unresolved || passCount === 0) whyNot.push('passes');
  if (passCount > 20) whyNot.push('unusually many passes');
  if (!ev) whyNot.push('night');
  if (d.warnings.length) whyNot.push('warnings');
  if (/\?/.test(d.sourceText)) whyNot.push('unreadable digits');
  if (pays.reduce((s, p) => s + p.amount, 0) > base) whyNot.push('paid more than total');

  return { eventId: ev?.id, qty, phone: d.phone ? d.phone.slice(3) : '', name: d.name ?? '', pays, warnings, base, autoOk: whyNot.length === 0, whyNot };
}
