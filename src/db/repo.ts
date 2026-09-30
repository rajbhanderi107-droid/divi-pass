import { ulid } from 'ulid';
import { db } from './schema';
import { computePunchState, computeSeats, computeTotal, netPaid } from '../domain/status';
import { normalizePhone } from '../domain/phone';
import type { Channel, Customer, Payment, Sale, SaleLine } from '../domain/types';

export class DuplicateUtrError extends Error {
  constructor(public utr: string, public saleId: string) { super(`UTR ${utr} already recorded`); }
}
export class ValidationError extends Error {}

const now = () => Date.now();
const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

async function audit(entity: string, entityId: string, action: string, before?: unknown, after?: unknown) {
  await db.auditLog.add({ at: now(), entity, entityId, action, before, after });
}

async function bumpBackupCounter() {
  const c = (await db.settings.get('salesSinceBackup'))?.value as number | undefined;
  await db.settings.put({ key: 'salesSinceBackup', value: (c ?? 0) + 1 });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db.settings.get(key);
  return (r?.value as T) ?? fallback;
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

export async function findPaymentByUtr(utr: string): Promise<Payment | undefined> {
  return live(await db.payments.where('utr').equals(utr).toArray())[0];
}
export async function findSaleByHash(hash: string): Promise<Sale | undefined> {
  return live(await db.sales.where('sourceHash').equals(hash).toArray())[0];
}
/** Same phone + same total created in the last 10 minutes. */
export async function findNearDuplicate(phone: string, total: number, at = now()): Promise<Sale | undefined> {
  const cust = live(await db.customers.where('phone').equals(phone).toArray())[0];
  if (!cust) return undefined;
  const sales = await db.sales.where('customerId').equals(cust.id).toArray();
  return live(sales).find((s) => !s.cancelledAt && s.total === total && at - s.createdAt < 10 * 60_000);
}

export interface NewPayment {
  amount: number; method: Payment['method']; utr?: string; receiverId?: string; paidAt?: number; note?: string;
}
export interface NewSale {
  eventId: string; name?: string; phone: string;
  lines: { passTypeId: string; qty: number; unitPrice?: number }[];
  discount?: number; channel?: Channel; notes?: string; sourceText?: string; sourceHash?: string;
  payments?: NewPayment[];
}

function checkPayment(p: NewPayment) {
  if (!Number.isSafeInteger(p.amount) || p.amount <= 0) throw new ValidationError('Amount must be a whole number above 0');
  if (p.utr !== undefined && !/^\d{12}$/.test(p.utr)) throw new ValidationError('UTR must be 12 digits');
}

async function insertPayment(saleId: string, kind: Payment['kind'], p: NewPayment): Promise<Payment> {
  checkPayment(p);
  if (p.utr) {
    const dup = await findPaymentByUtr(p.utr);
    if (dup) throw new DuplicateUtrError(p.utr, dup.saleId);
  }
  const t = now();
  const row: Payment = { id: ulid(), saleId, kind, amount: p.amount, method: p.method, utr: p.utr, receiverId: p.receiverId, paidAt: p.paidAt ?? t, note: p.note, createdAt: t, updatedAt: t };
  await db.payments.add(row);
  await audit('payment', row.id, 'create', undefined, row);
  return row;
}

export async function createSale(input: NewSale): Promise<Sale> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ValidationError('Enter a valid 10-digit mobile number');
  if (!input.lines.length) throw new ValidationError('Add at least one pass');
  if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) throw new ValidationError('Quantity must be 1 or more');
  const discount = input.discount ?? 0;
  if (!Number.isSafeInteger(discount) || discount < 0) throw new ValidationError('Discount must be 0 or more');

  return db.transaction('rw', [db.events, db.passTypes, db.customers, db.sales, db.payments, db.settings, db.auditLog], async () => {
    if (!(await db.events.get(input.eventId))) throw new ValidationError('Pick a night');
    const lines: SaleLine[] = [];
    for (const l of input.lines) {
      const pt = await db.passTypes.get(l.passTypeId);
      if (!pt) throw new ValidationError('Unknown pass type');
      const price = l.unitPrice ?? pt.price;
      if (!Number.isSafeInteger(price) || price < 0) throw new ValidationError('Price must be a whole number');
      lines.push({ passTypeId: pt.id, nameSnap: pt.name, seatsPerUnitSnap: pt.seatsPerUnit, listPriceSnap: pt.listPrice, unitPriceSnap: price, qty: l.qty });
    }
    const total = computeTotal(lines, discount);
    if (total < 0) throw new ValidationError('Discount is more than the total');

    const t = now();
    let cust = live(await db.customers.where('phone').equals(phone).toArray())[0];
    const name = input.name?.trim();
    if (!cust) {
      cust = { id: ulid(), phone, name: name ?? '', nameLower: (name ?? '').toLowerCase(), createdAt: t, updatedAt: t } as Customer;
      await db.customers.add(cust);
    } else if (name && !cust.name) {
      cust = { ...cust, name, nameLower: name.toLowerCase(), updatedAt: t };
      await db.customers.put(cust);
    }
    const counter = ((await db.settings.get('refCounter'))?.value as number | undefined ?? 0) + 1;
    await db.settings.put({ key: 'refCounter', value: counter });
    const sale: Sale = {
      id: ulid(), refNo: `DV-${String(counter).padStart(4, '0')}`, eventId: input.eventId, customerId: cust.id,
      lines, discount, total, seats: computeSeats(lines), channel: input.channel ?? 'whatsapp',
      punchState: computePunchState(lines), notes: input.notes, sourceText: input.sourceText, sourceHash: input.sourceHash,
      createdAt: t, updatedAt: t,
    };
    await db.sales.add(sale);
    await audit('sale', sale.id, 'create', undefined, sale);
    for (const p of input.payments ?? []) await insertPayment(sale.id, 'receipt', p);
    await bumpBackupCounter();
    return sale;
  });
}

export function addPayment(saleId: string, p: NewPayment, kind: Payment['kind'] = 'receipt') {
  return db.transaction('rw', [db.sales, db.payments, db.settings, db.auditLog], async () => {
    const sale = await db.sales.get(saleId);
    if (!sale || sale.deletedAt) throw new ValidationError('Sale not found');
    if (kind === 'refund') {
      const net = netPaid(await db.payments.where('saleId').equals(saleId).toArray());
      if (p.amount > net) throw new ValidationError('Refund is more than what was paid');
    }
    const row = await insertPayment(saleId, kind, p);
    await db.sales.update(saleId, { updatedAt: now() });
    await bumpBackupCounter();
    return row;
  });
}

export function updateSale(id: string, patch: { lines?: { passTypeId: string; qty: number; unitPrice?: number; punchedAt?: number }[]; discount?: number; eventId?: string; notes?: string }) {
  return db.transaction('rw', [db.sales, db.passTypes, db.events, db.settings, db.auditLog], async () => {
    const before = await db.sales.get(id);
    if (!before || before.deletedAt) throw new ValidationError('Sale not found');
    let lines = before.lines;
    if (patch.lines) {
      lines = [];
      for (const l of patch.lines) {
        if (!Number.isInteger(l.qty) || l.qty < 1) throw new ValidationError('Quantity must be 1 or more');
        const old = before.lines.find((o) => o.passTypeId === l.passTypeId);
        const pt = await db.passTypes.get(l.passTypeId);
        if (!pt && !old) throw new ValidationError('Unknown pass type');
        const price = l.unitPrice ?? old?.unitPriceSnap ?? pt!.price;
        if (!Number.isSafeInteger(price) || price < 0) throw new ValidationError('Price must be a whole number');
        lines.push({
          passTypeId: l.passTypeId, nameSnap: old?.nameSnap ?? pt!.name, seatsPerUnitSnap: old?.seatsPerUnitSnap ?? pt!.seatsPerUnit,
          listPriceSnap: old?.listPriceSnap ?? pt!.listPrice, unitPriceSnap: price, qty: l.qty, punchedAt: l.punchedAt ?? old?.punchedAt,
        });
      }
    }
    const discount = patch.discount ?? before.discount;
    const total = computeTotal(lines, discount);
    if (discount < 0 || total < 0) throw new ValidationError('Discount is more than the total');
    if (patch.eventId && !(await db.events.get(patch.eventId))) throw new ValidationError('Pick a night');
    const after: Sale = {
      ...before, lines, discount, total, seats: computeSeats(lines), punchState: computePunchState(lines),
      eventId: patch.eventId ?? before.eventId, notes: patch.notes ?? before.notes, updatedAt: now(),
    };
    await db.sales.put(after);
    await audit('sale', id, 'update', before, after);
    return after;
  });
}

export function setLinePunched(saleId: string, index: number, punched: boolean) {
  return db.transaction('rw', [db.sales, db.auditLog], async () => {
    const s = await db.sales.get(saleId);
    if (!s || !s.lines[index]) throw new ValidationError('Line not found');
    const lines = s.lines.map((l, i) => (i === index ? { ...l, punchedAt: punched ? now() : undefined } : l));
    const after = { ...s, lines, punchState: computePunchState(lines), updatedAt: now() };
    await db.sales.put(after);
    await audit('sale', saleId, 'update', { punchState: s.punchState }, { punchState: after.punchState });
    return after;
  });
}

export function markAllPunched(saleId: string) {
  return db.transaction('rw', [db.sales, db.auditLog], async () => {
    const s = await db.sales.get(saleId);
    if (!s) throw new ValidationError('Sale not found');
    const t = now();
    const lines = s.lines.map((l) => ({ ...l, punchedAt: l.punchedAt ?? t }));
    const after = { ...s, lines, punchState: computePunchState(lines), updatedAt: t };
    await db.sales.put(after);
    await audit('sale', saleId, 'update', { punchState: s.punchState }, { punchState: after.punchState });
  });
}

export function cancelSale(id: string, cancelled = true) {
  return db.transaction('rw', [db.sales, db.auditLog], async () => {
    const s = await db.sales.get(id);
    if (!s) throw new ValidationError('Sale not found');
    await db.sales.put({ ...s, cancelledAt: cancelled ? now() : undefined, updatedAt: now() });
    await audit('sale', id, cancelled ? 'cancel' : 'uncancel');
  });
}

/** Soft delete a sale and its payments; restoring reverses it. */
export function deleteSale(id: string) {
  return db.transaction('rw', [db.sales, db.payments, db.auditLog], async () => {
    const t = now();
    await db.sales.update(id, { deletedAt: t, updatedAt: t });
    await db.payments.where('saleId').equals(id).modify({ deletedAt: t, updatedAt: t });
    await audit('sale', id, 'delete');
  });
}
export function restoreSale(id: string) {
  return db.transaction('rw', [db.sales, db.payments, db.auditLog], async () => {
    const t = now();
    const s = await db.sales.get(id);
    const at = s?.deletedAt;
    await db.sales.update(id, { deletedAt: undefined, updatedAt: t });
    await db.payments.where('saleId').equals(id).filter((p) => p.deletedAt === at).modify({ deletedAt: undefined, updatedAt: t });
    await audit('sale', id, 'restore');
  });
}
export function deletePayment(id: string) {
  return db.transaction('rw', [db.payments, db.auditLog], async () => {
    await db.payments.update(id, { deletedAt: now(), updatedAt: now() });
    await audit('payment', id, 'delete');
  });
}
export function restorePayment(id: string) {
  return db.transaction('rw', [db.payments, db.auditLog], async () => {
    await db.payments.update(id, { deletedAt: undefined, updatedAt: now() });
    await audit('payment', id, 'restore');
  });
}

/** Permanently remove trash older than 30 days. */
export function purgeTrash(olderThanMs = 30 * 86_400_000) {
  const cutoff = now() - olderThanMs;
  return db.transaction('rw', [db.sales, db.payments, db.auditLog], async () => {
    const old = await db.sales.filter((s) => !!s.deletedAt && s.deletedAt < cutoff).primaryKeys();
    await db.payments.where('saleId').anyOf(old).delete();
    await db.sales.bulkDelete(old);
    for (const id of old) await audit('sale', id, 'purge');
    return old.length;
  });
}

export async function addReceiver(name: string) {
  const n = name.trim();
  if (!n) throw new ValidationError('Enter a name');
  const ex = (await db.receivers.toArray()).find((r) => !r.deletedAt && r.nameLower === n.toLowerCase());
  if (ex) return ex;
  const t = now();
  const row = { id: ulid(), name: n, nameLower: n.toLowerCase(), createdAt: t, updatedAt: t };
  await db.receivers.add(row);
  return row;
}

export async function addEvent(date: string, name = 'Divya Achariya Divi') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('Pick a date');
  const ex = live(await db.events.where('date').equals(date).toArray())[0];
  if (ex) throw new ValidationError('That night already exists');
  const t = now();
  await db.events.add({ id: ulid(), date, name, createdAt: t, updatedAt: t });
}
export async function deleteEvent(id: string) {
  const used = live(await db.sales.where('eventId').equals(id).toArray()).length;
  if (used) throw new ValidationError(`This night has ${used} sale${used === 1 ? '' : 's'} — move or delete them first`);
  await db.events.update(id, { deletedAt: now(), updatedAt: now() });
}
export async function savePassType(p: { id?: string; name: string; kind: 'solo' | 'couple' | 'other'; seatsPerUnit: number; listPrice: number; price: number; active: boolean }) {
  if (!p.name.trim()) throw new ValidationError('Enter a name');
  for (const n of [p.listPrice, p.price]) if (!Number.isSafeInteger(n) || n < 0) throw new ValidationError('Prices must be whole rupees');
  if (!Number.isInteger(p.seatsPerUnit) || p.seatsPerUnit < 1) throw new ValidationError('Seats must be 1 or more');
  const t = now();
  if (p.id) { await db.passTypes.update(p.id, { ...p, name: p.name.trim(), updatedAt: t }); return; }
  const order = (await db.passTypes.count()) + 1;
  await db.passTypes.add({ ...p, id: ulid(), name: p.name.trim(), aliases: [p.name.trim().toLowerCase()], sortOrder: order, createdAt: t, updatedAt: t });
}
