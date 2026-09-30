import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiviDB, db, useDatabase } from './schema';
import { seedIfEmpty } from './seed';
import { addPayment, cancelSale, createSale, deleteSale, DuplicateUtrError, findNearDuplicate, purgeTrash, restoreSale, setLinePunched, updateSale, ValidationError } from './repo';
import { applyImport, buildBackup, parseBackup, previewImport } from './backup';
import { netPaid, payStatus } from '../domain/status';

let n = 0;
async function fresh() {
  useDatabase(new DiviDB('t' + n++));
  await seedIfEmpty();
  const events = await db.events.orderBy('date').toArray();
  const [solo, couple] = (await db.passTypes.orderBy('sortOrder').toArray());
  return { ev: events.find((e) => e.date === '2026-10-16')!, solo: solo!, couple: couple! };
}
let ctx: Awaited<ReturnType<typeof fresh>>;
beforeEach(async () => { ctx = await fresh(); });

describe('sales', () => {
  it('creates sale, customer, split payments atomically', async () => {
    const s = await createSale({
      eventId: ctx.ev.id, name: 'Vanshika Banodia', phone: '+919313585913',
      lines: [{ passTypeId: ctx.solo.id, qty: 5 }],
      payments: [{ amount: 2600, method: 'upi', utr: '627223546951' }, { amount: 650, method: 'upi', utr: '627326018483' }],
    });
    expect(s.total).toBe(3250); expect(s.seats).toBe(5); expect(s.refNo).toBe('DV-0001');
    const pays = await db.payments.where('saleId').equals(s.id).toArray();
    expect(payStatus(s, pays)).toBe('paid');
    expect(await db.customers.count()).toBe(1);
  });
  it('snapshots price; editing pass type does not change old sale', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 2 }] });
    await db.passTypes.update(ctx.solo.id, { price: 700 });
    expect((await db.sales.get(s.id))!.total).toBe(1300);
  });
  it('same person with 0/+91 formats is one customer', async () => {
    await createSale({ eventId: ctx.ev.id, phone: '09913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] });
    await createSale({ eventId: ctx.ev.id, phone: '+91 99138 03737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] });
    expect(await db.customers.count()).toBe(1);
  });
  it('rolls back everything when a payment fails', async () => {
    await expect(createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }], payments: [{ amount: 650, method: 'upi', utr: 'bad' }] })).rejects.toThrow(ValidationError);
    expect(await db.sales.count()).toBe(0); expect(await db.customers.count()).toBe(0);
  });
  it('validates', async () => {
    await expect(createSale({ eventId: ctx.ev.id, phone: '5913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] })).rejects.toThrow('valid');
    await expect(createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 0 }] })).rejects.toThrow();
    await expect(createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }], discount: 5000 })).rejects.toThrow();
  });
  it('edit recomputes total, seats and keeps history', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 2 }] });
    const u = await updateSale(s.id, { lines: [{ passTypeId: ctx.solo.id, qty: 3 }, { passTypeId: ctx.couple.id, qty: 1 }], discount: 100 });
    expect(u.total).toBe(3 * 650 + 1300 - 100); expect(u.seats).toBe(5);
    expect((await db.auditLog.where('entityId').equals(s.id).toArray()).map((a) => a.action)).toEqual(['create', 'update']);
  });
  it('near duplicate within 10 minutes', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 2 }] });
    expect((await findNearDuplicate('+919913803737', 1300))?.id).toBe(s.id);
    expect(await findNearDuplicate('+919913803737', 650)).toBeUndefined();
  });
});

describe('payments', () => {
  it('blocks duplicate UTR with link to existing sale', async () => {
    const a = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }], payments: [{ amount: 650, method: 'upi', utr: '627326018483' }] });
    const b = await createSale({ eventId: ctx.ev.id, phone: '9426672046', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] });
    await expect(addPayment(b.id, { amount: 650, method: 'upi', utr: '627326018483' })).rejects.toMatchObject({ saleId: a.id });
    await expect(addPayment(b.id, { amount: 650, method: 'upi', utr: '627326018483' })).rejects.toBeInstanceOf(DuplicateUtrError);
  });
  it('refund cannot exceed paid; cancel gives refundDue then cancelled', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 2 }], payments: [{ amount: 1300, method: 'cash' }] });
    await expect(addPayment(s.id, { amount: 2000, method: 'cash' }, 'refund')).rejects.toThrow('more than');
    await cancelSale(s.id);
    let sale = (await db.sales.get(s.id))!; let pays = await db.payments.where('saleId').equals(s.id).toArray();
    expect(payStatus(sale, pays)).toBe('refundDue');
    await addPayment(s.id, { amount: 1300, method: 'cash' }, 'refund');
    sale = (await db.sales.get(s.id))!; pays = await db.payments.where('saleId').equals(s.id).toArray();
    expect(payStatus(sale, pays)).toBe('cancelled'); expect(netPaid(pays)).toBe(0);
  });
  it('rejects decimals and negative amounts', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] });
    await expect(addPayment(s.id, { amount: 650.5, method: 'cash' })).rejects.toThrow();
    await expect(addPayment(s.id, { amount: -5, method: 'cash' })).rejects.toThrow();
  });
});

describe('punch, trash', () => {
  it('per-line punch gives partial', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.couple.id, qty: 1 }, { passTypeId: ctx.solo.id, qty: 2 }] });
    expect((await setLinePunched(s.id, 0, true)).punchState).toBe('partial');
    expect((await setLinePunched(s.id, 1, true)).punchState).toBe('done');
    expect((await setLinePunched(s.id, 1, false)).punchState).toBe('partial');
  });
  it('delete cascades to payments, restore brings them back, purge removes', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }], payments: [{ amount: 650, method: 'cash' }] });
    await deleteSale(s.id);
    expect((await db.payments.toArray()).every((p) => p.deletedAt)).toBe(true);
    await restoreSale(s.id);
    expect((await db.payments.toArray()).every((p) => !p.deletedAt)).toBe(true);
    await deleteSale(s.id);
    expect(await purgeTrash(-1)).toBe(1);
    expect(await db.sales.count()).toBe(0); expect(await db.payments.count()).toBe(0);
  });
  it('a deleted payment frees its UTR', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }], payments: [{ amount: 650, method: 'upi', utr: '627326018483' }] });
    await deleteSale(s.id);
    const b = await createSale({ eventId: ctx.ev.id, phone: '9426672046', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] });
    await expect(addPayment(b.id, { amount: 650, method: 'upi', utr: '627326018483' })).resolves.toBeTruthy();
  });
});

describe('backup', () => {
  it('round trip into a fresh db gives identical data; damaged file rejected', async () => {
    await createSale({ eventId: ctx.ev.id, name: 'A', phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 2 }], payments: [{ amount: 1300, method: 'upi', utr: '627326018483' }] });
    const text = JSON.stringify(await buildBackup());
    const file = parseBackup(text);
    const before = await db.sales.toArray();
    await fresh();
    expect(await db.sales.count()).toBe(0);
    const prev = await previewImport(file);
    expect(prev.added).toBeGreaterThan(0);
    await applyImport(file);
    expect((await db.sales.toArray()).map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(await db.payments.count()).toBe(1);
    expect(() => parseBackup(text.replace('"amount":1300', '"amount":9999'))).toThrow('damaged');
    expect(() => parseBackup('{}')).toThrow('not a Divi Pass');
  });
  it('newest updatedAt wins on merge', async () => {
    const s = await createSale({ eventId: ctx.ev.id, phone: '9913803737', lines: [{ passTypeId: ctx.solo.id, qty: 1 }] });
    const file = await buildBackup();
    await updateSale(s.id, { notes: 'local newer' });
    await applyImport(file);
    expect((await db.sales.get(s.id))!.notes).toBe('local newer');
  });
});
