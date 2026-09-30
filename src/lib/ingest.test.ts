import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiviDB, db, useDatabase } from '../db/schema';
import { seedIfEmpty } from '../db/seed';
import { createSale } from '../db/repo';
import { ingestText, type IngestCtx } from './ingest';

let n = 0; let ctx: IngestCtx;
beforeEach(async () => {
  useDatabase(new DiviDB('i' + n++)); await seedIfEmpty();
  ctx = { passTypes: await db.passTypes.orderBy('sortOrder').toArray(), events: await db.events.orderBy('date').toArray(), receivers: await db.receivers.toArray(), lastReceiverId: '', season: { from: '2026-10-11', to: '2026-10-19' }, mode: 'always', fromPhoto: false, today: '2026-09-30' };
});
const NIYATI = 'Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday';
const VANSHIKA = 'Name : vanshika banodia\nPass : 5 solo\nNo : +919313585913\nDate : 16th october Friday\n2600 + 650';

describe('automatic adding (always)', () => {
  it('adds the real message with no questions asked', async () => {
    const r = await ingestText(NIYATI, ctx);
    expect(r.fallbackToForm).toBe(false); expect(r.added).toHaveLength(1);
    const s = r.added[0]!.sale; expect(s).toMatchObject({ total: 1300, seats: 2 }); expect(s.needsCheck).toBeUndefined();
    expect((await db.events.get(s.eventId))!.date).toBe('2026-10-16');
  });
  it('adds several messages pasted together, with their split payments', async () => {
    const r = await ingestText(NIYATI + '\n\n' + VANSHIKA, ctx);
    expect(r.added.map((a) => a.sale.total)).toEqual([1300, 3250]);
    expect(await db.payments.count()).toBe(2); expect(r.added[1]!.paid).toBe(3250);
  });
  it('a missing date is saved on the next night and marked Check', async () => {
    const r = await ingestText('Name : Ravi\nPass : 1 couple\nNo : 9000000001', ctx);
    expect(r.added).toHaveLength(1); expect(r.added[0]!.flags.join(' ')).toContain('night was assumed');
    expect((await db.events.get(r.added[0]!.sale.eventId))!.date).toBe('2026-10-11');
    expect((await db.sales.toArray())[0]!.needsCheck?.length).toBe(1);
  });
  it('weekday mismatch and price differences are saved but marked Check', async () => {
    const r = await ingestText('Name : Ravi\nPass : 2 solo\nNo : 9000000001\nDate : 16 oct Monday\nTotal 1000', ctx);
    expect(r.added).toHaveLength(1); const f = r.added[0]!.flags.join(' | ');
    expect(f).toContain('Weekday does not match'); expect(f).toContain('differs from your price');
  });
  it('no phone, or an unclear pass, goes to the Inbox instead of being lost', async () => {
    const r = await ingestText('Name : Ravi\nPass : 2 solo\nDate : 16 oct\n\nName : Mina\nPass : 3\nNo : 9000000002\nDate : 16 oct', ctx);
    expect(r.added).toHaveLength(0); expect(r.inbox).toHaveLength(2);
    const rows = await db.inbox.toArray(); expect(rows.map((x) => x.reason).sort()).toEqual(['No valid phone number in the message', 'Pass type is unclear']);
    expect(await db.sales.count()).toBe(0);
  });
  it('the same message twice is added once', async () => {
    await ingestText(NIYATI, ctx); const r = await ingestText(NIYATI, ctx);
    expect(r.added).toHaveLength(0); expect(r.duplicates).toHaveLength(1); expect(await db.sales.count()).toBe(1);
  });
  it('a payment card is attached to the one unpaid sale of that amount', async () => {
    await ingestText(NIYATI, ctx);
    const r = await ingestText('₹1,300\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997', ctx);
    expect(r.paymentsAdded).toEqual(['₹1300']); const p = (await db.payments.toArray())[0]!;
    expect(p).toMatchObject({ amount: 1300, utr: '627325985997' }); expect(p.receiverId).toBe(ctx.receivers.find((x) => x.name === 'Bhanderi Raj')!.id);
    // the same card again is ignored
    const again = await ingestText('₹1,300\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997', ctx);
    expect(again.paymentsAdded).toHaveLength(0); expect(again.duplicates).toHaveLength(1); expect(again.inbox).toHaveLength(0); expect(await db.payments.count()).toBe(1);
  });
  it('a payment with no single matching sale goes to the Inbox', async () => {
    await ingestText(NIYATI, ctx);
    let r = await ingestText('₹777\nPaid to Bhanderi Raj\nUPI transaction ID 627111111111', ctx);
    expect(r.inbox).toHaveLength(1);
    const solo = ctx.passTypes[0]!; const ev = ctx.events[5]!;
    await createSale({ eventId: ev.id, phone: '9000000009', lines: [{ passTypeId: solo.id, qty: 2 }] }); // second unpaid ₹1,300 sale
    r = await ingestText('₹1,300\nPaid to Bhanderi Raj\nUPI transaction ID 627222222222', ctx);
    expect(r.inbox).toHaveLength(1); expect((await db.inbox.toArray()).pop()!.reason).toContain('more than one');
  });
  it('the photo case: message text plus a payment thumbnail amount marks the sale paid', async () => {
    const r = await ingestText(NIYATI + '\n₹1,300', { ...ctx, fromPhoto: true });
    expect(r.added[0]!.paid).toBe(1300); expect(await db.payments.count()).toBe(1);
  });
});

describe('other modes', () => {
  it('off: nothing is saved, the form is used', async () => {
    const r = await ingestText(NIYATI, { ...ctx, mode: 'off' }); expect(r.fallbackToForm).toBe(true); expect(await db.sales.count()).toBe(0);
  });
  it('clear: saves only when everything is clear, else the form opens and nothing is saved', async () => {
    expect((await ingestText(NIYATI, { ...ctx, mode: 'clear' })).added).toHaveLength(1);
    const r = await ingestText('Name : A\nPass : 2 solo\nNo : 9000000003', { ...ctx, mode: 'clear' });
    expect(r.fallbackToForm).toBe(true); expect(await db.sales.count()).toBe(1);
  });
  it('nothing recognised falls back to the form', async () => { expect((await ingestText('hi bro', ctx)).fallbackToForm).toBe(true); });
});
