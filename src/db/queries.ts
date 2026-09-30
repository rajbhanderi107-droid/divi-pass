import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { amountDue, payStatus, type PayStatus } from '../domain/status';
import type { Customer, EventNight, Payment, Sale } from '../domain/types';

export interface SaleView { sale: Sale; customer?: Customer; event?: EventNight; payments: Payment[]; status: PayStatus; due: number }

const live = <T extends { deletedAt?: number }>(r: T[]) => r.filter((x) => !x.deletedAt);

export function useSalesView(): SaleView[] | undefined {
  return useLiveQuery(async () => {
    const [sales, customers, payments, events] = await Promise.all([
      db.sales.toArray(), db.customers.toArray(), db.payments.toArray(), db.events.toArray(),
    ]);
    const cm = new Map(customers.map((c) => [c.id, c])); const em = new Map(events.map((e) => [e.id, e]));
    const pm = new Map<string, Payment[]>();
    for (const p of live(payments)) { const a = pm.get(p.saleId) ?? []; a.push(p); pm.set(p.saleId, a); }
    return live(sales).sort((a, b) => b.createdAt - a.createdAt).map((sale) => {
      const ps = pm.get(sale.id) ?? [];
      return { sale, customer: cm.get(sale.customerId), event: em.get(sale.eventId), payments: ps, status: payStatus(sale, ps), due: amountDue(sale, ps) };
    });
  }, []);
}

export const useEvents = () => useLiveQuery(async () => live(await db.events.orderBy('date').toArray()), []);
export const usePassTypes = () => useLiveQuery(async () => live(await db.passTypes.orderBy('sortOrder').toArray()), []);
export const useReceivers = () => useLiveQuery(async () => live(await db.receivers.toArray()), []);
export function useSetting<T>(key: string, fallback: T): T {
  return (useLiveQuery(async () => (await db.settings.get(key))?.value as T | undefined, [key]) ?? fallback) as T;
}
