import type { Payment, PunchState, Sale, SaleLine } from './types';

export type PayStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'refundDue' | 'cancelled';

export const computeTotal = (lines: Pick<SaleLine, 'qty' | 'unitPriceSnap'>[], discount: number) =>
  lines.reduce((s, l) => s + l.qty * l.unitPriceSnap, 0) - discount;

export const computeSeats = (lines: Pick<SaleLine, 'qty' | 'seatsPerUnitSnap'>[]) =>
  lines.reduce((s, l) => s + l.qty * l.seatsPerUnitSnap, 0);

export function computePunchState(lines: Pick<SaleLine, 'punchedAt'>[]): PunchState {
  const n = lines.filter((l) => l.punchedAt).length;
  return n === 0 ? 'none' : n === lines.length ? 'done' : 'partial';
}

export const netPaid = (payments: Pick<Payment, 'kind' | 'amount' | 'deletedAt'>[]) =>
  payments.filter((p) => !p.deletedAt).reduce((s, p) => s + (p.kind === 'receipt' ? p.amount : -p.amount), 0);

export function payStatus(sale: Pick<Sale, 'total' | 'cancelledAt'>, payments: Pick<Payment, 'kind' | 'amount' | 'deletedAt'>[]): PayStatus {
  const net = netPaid(payments);
  if (sale.cancelledAt) return net > 0 ? 'refundDue' : 'cancelled';
  if (net <= 0) return sale.total === 0 ? 'paid' : 'unpaid';
  if (net < sale.total) return 'partial';
  return net === sale.total ? 'paid' : 'overpaid';
}

export const amountDue = (sale: Pick<Sale, 'total' | 'cancelledAt'>, payments: Pick<Payment, 'kind' | 'amount' | 'deletedAt'>[]) =>
  sale.cancelledAt ? 0 : Math.max(0, sale.total - netPaid(payments));
