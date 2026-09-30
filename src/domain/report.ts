import type { EventNight, Expense } from './types';
import type { SaleView } from '../db/queries';
import { formatINR } from './money';
import { formatDateLabel } from './time';
import { netPaid } from './status';

export interface NightStats { eventId: string; date: string; sales: number; seats: number; revenue: number; collected: number; due: number; unpunched: number; expenses: number; net: number; byReceiver: Record<string, number> }

export function nightStats(ev: EventNight, views: SaleView[], expenses: Expense[]): NightStats {
  const vs = views.filter((v) => v.sale.eventId === ev.id && !v.sale.cancelledAt);
  const all = views.filter((v) => v.sale.eventId === ev.id);
  const byReceiver: Record<string, number> = {};
  for (const v of all) for (const p of v.payments) { const k = p.receiverId ?? ''; byReceiver[k] = (byReceiver[k] ?? 0) + (p.kind === 'receipt' ? p.amount : -p.amount); }
  const collected = all.reduce((a, v) => a + netPaid(v.payments), 0);
  const exp = expenses.filter((e) => e.eventId === ev.id && !e.deletedAt).reduce((a, e) => a + e.amount, 0);
  return {
    eventId: ev.id, date: ev.date, sales: vs.length, seats: vs.reduce((a, v) => a + v.sale.seats, 0),
    revenue: vs.reduce((a, v) => a + v.sale.total, 0), collected, due: vs.reduce((a, v) => a + v.due, 0),
    unpunched: vs.filter((v) => v.sale.punchState !== 'done').length, expenses: exp, net: collected - exp, byReceiver,
  };
}

/** Text you can paste into WhatsApp. */
export function summaryText(s: NightStats): string {
  return [
    `Divi Pass — ${formatDateLabel(s.date)}`,
    `Sales: ${s.sales} · Seats: ${s.seats}`,
    `Sold value: ${formatINR(s.revenue)}`,
    `Collected: ${formatINR(s.collected)} · Due: ${formatINR(s.due)}`,
    `Not punched in Showmates: ${s.unpunched}`,
    ...(s.expenses ? [`Expenses: ${formatINR(s.expenses)} · Net: ${formatINR(s.net)}`] : []),
  ].join('\n');
}
