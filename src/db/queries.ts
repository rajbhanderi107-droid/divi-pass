import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { amountDue, payStatus, type PayStatus } from '../domain/status';
import { bookMembers } from '../domain/book';
import type { Profile } from '../auth';
import type { Customer, EventNight, Payment, Sale } from '../domain/types';

export interface SaleView { sale: Sale; customer?: Customer; event?: EventNight; payments: Payment[]; status: PayStatus; due: number }

const live = <T extends { deletedAt?: number }>(r: T[]) => r.filter((x) => !x.deletedAt);

/** Whose sales are shown: only super admins can see everyone; admins and sellers always see just their own book. */
export async function readBook(): Promise<string> {
  const p = (await db.settings.get('profile'))?.value as Profile | undefined;
  if (p && p.role !== 'super') return p.personId ?? '-';
  return ((await db.settings.get('book'))?.value as string | undefined) ?? '';
}

/** Sales with their buyer, night and payments. Follows the chosen seller book unless `all` is set (lookups by id). */
export function useSalesView(all = false): SaleView[] | undefined {
  return useLiveQuery(async () => {
    const [sales0, customers, payments, events, people, book] = await Promise.all([
      db.sales.toArray(), db.customers.toArray(), db.payments.toArray(), db.events.toArray(), db.receivers.toArray(), readBook(),
    ]);
    const mem = all ? null : bookMembers(people, book);
    const sales = mem ? sales0.filter((s) => s.sellerId && mem.has(s.sellerId)) : sales0;
    const cm = new Map(customers.map((c) => [c.id, c])); const em = new Map(events.map((e) => [e.id, e]));
    const pm = new Map<string, Payment[]>();
    for (const p of live(payments)) { const a = pm.get(p.saleId) ?? []; a.push(p); pm.set(p.saleId, a); }
    return live(sales).sort((a, b) => b.createdAt - a.createdAt).map((sale) => {
      const ps = pm.get(sale.id) ?? [];
      return { sale, customer: cm.get(sale.customerId), event: em.get(sale.eventId), payments: ps, status: payStatus(sale, ps), due: amountDue(sale, ps) };
    });
  }, [all]);
}

export const useEvents = () => useLiveQuery(async () => live(await db.events.orderBy('date').toArray()), []);
export const usePassTypes = () => useLiveQuery(async () => live(await db.passTypes.orderBy('sortOrder').toArray()), []);
export const useReceivers = () => useLiveQuery(async () => live(await db.receivers.toArray()), []);
export function useSetting<T>(key: string, fallback: T): T {
  return (useLiveQuery(async () => (await db.settings.get(key))?.value as T | undefined, [key]) ?? fallback) as T;
}
export const useInbox = () => useLiveQuery(async () => (await db.inbox.orderBy('createdAt').toArray()).filter((x) => !x.deletedAt), []);
export const useBook = (): string => (useLiveQuery(() => readBook(), []) ?? '');
