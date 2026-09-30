import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiviDB, db, useDatabase } from '../db/schema';
import { seedIfEmpty } from '../db/seed';
import { addPayment, createSale, deleteSale, updateSale } from '../db/repo';
import { syncOnce, type SyncRow, type Transport } from './engine';

/** Same rules as the real server function: last writer wins per row, and a cursor of changes. */
function fakeServer() {
  const rows = new Map<string, { row: SyncRow; seq: number }>(); let seq = 0; let calls = 0;
  const send: Transport = async ({ since, push }) => {
    calls++;
    for (const r of push) {
      const k = r.t + '|' + r.id; const cur = rows.get(k);
      if (!cur || cur.row.updatedAt < r.updatedAt) rows.set(k, { row: r, seq: ++seq });
    }
    const list = [...rows.values()].filter((x) => x.seq > since).sort((a, b) => a.seq - b.seq).slice(0, 500);
    return { rows: list.map((x) => x.row), cursor: list.length ? list[list.length - 1]!.seq : since, more: list.length === 500 };
  };
  return { send, rows, calls: () => calls };
}

let n = 0;
async function device(seed = true) { const d = new DiviDB('sync' + n++); useDatabase(d); if (seed) await seedIfEmpty(); return d; }
const on = (d: DiviDB) => useDatabase(d);

describe('two phones + the cloud', () => {
  let A: DiviDB; let B: DiviDB; let srv: ReturnType<typeof fakeServer>;
  beforeEach(async () => { srv = fakeServer(); A = await device(); B = await device(); });

  it('a sale added on phone A shows up on phone B, with its payments', async () => {
    on(A); const ev = (await db.events.toArray()).find((e) => e.date === '2026-10-16')!; const solo = (await db.passTypes.orderBy('sortOrder').toArray())[0]!;
    const s = await createSale({ eventId: ev.id, name: 'Niyati Patel', phone: '9913803737', lines: [{ passTypeId: solo.id, qty: 2 }], payments: [{ amount: 1300, method: 'upi', utr: '627325985997' }] });
    await syncOnce(srv.send);
    on(B); const r = await syncOnce(srv.send);
    expect(r.pulled).toBeGreaterThan(0);
    const got = await db.sales.get(s.id); expect(got).toMatchObject({ total: 1300, seats: 2, refNo: s.refNo });
    expect(await db.payments.where('saleId').equals(s.id).count()).toBe(1);
    expect((await db.customers.toArray()).map((c) => c.name)).toContain('Niyati Patel');
  });

  it('edits and deletes travel both ways; the newer edit wins', async () => {
    on(A); const ev = (await db.events.toArray())[0]!; const solo = (await db.passTypes.orderBy('sortOrder').toArray())[0]!;
    const s = await createSale({ eventId: ev.id, phone: '9913803737', lines: [{ passTypeId: solo.id, qty: 1 }] });
    await syncOnce(srv.send); on(B); await syncOnce(srv.send);
    await new Promise((r) => setTimeout(r, 5));
    await updateSale(s.id, { notes: 'edited on B' }); await syncOnce(srv.send);
    on(A); await syncOnce(srv.send); expect((await db.sales.get(s.id))!.notes).toBe('edited on B');
    await new Promise((r) => setTimeout(r, 5));
    await deleteSale(s.id); await syncOnce(srv.send);
    on(B); await syncOnce(srv.send); expect((await db.sales.get(s.id))!.deletedAt).toBeTruthy();
  });

  it('an older copy never overwrites a newer one', async () => {
    on(A); const ev = (await db.events.toArray())[0]!; const solo = (await db.passTypes.orderBy('sortOrder').toArray())[0]!;
    const s = await createSale({ eventId: ev.id, phone: '9913803737', lines: [{ passTypeId: solo.id, qty: 1 }] });
    await syncOnce(srv.send); on(B); await syncOnce(srv.send);
    on(A); await new Promise((r) => setTimeout(r, 5)); await updateSale(s.id, { notes: 'newer (A)' });
    on(B); await syncOnce(srv.send); // B pushes nothing new; must not undo A's later edit
    on(A); await syncOnce(srv.send); on(B); await syncOnce(srv.send);
    expect((await db.sales.get(s.id))!.notes).toBe('newer (A)');
  });

  it('works offline: failed syncs change nothing, the next one catches up', async () => {
    on(A); const ev = (await db.events.toArray())[0]!; const solo = (await db.passTypes.orderBy('sortOrder').toArray())[0]!;
    const s = await createSale({ eventId: ev.id, phone: '9913803737', lines: [{ passTypeId: solo.id, qty: 1 }] });
    await expect(syncOnce(async () => { throw new Error('No internet'); })).rejects.toThrow();
    await addPayment(s.id, { amount: 650, method: 'cash' });
    await syncOnce(srv.send); on(B); await syncOnce(srv.send);
    expect(await db.payments.where('saleId').equals(s.id).count()).toBe(1);
  });

  it('starting nights, passes and receivers created separately on each phone are merged, not duplicated', async () => {
    // simulate an older phone whose seed rows have random ids
    const old = await device(false);
    const t = Date.now() - 100_000;
    await db.events.bulkAdd([{ id: 'zz-ev', date: '2026-10-16', name: 'x', createdAt: t, updatedAt: t }]);
    await db.receivers.bulkAdd([{ id: 'zz-rc', name: 'Bhanderi Raj', nameLower: 'bhanderi raj', createdAt: t, updatedAt: t }]);
    await db.passTypes.bulkAdd([{ id: 'zz-pt', name: 'Solo', kind: 'solo', seatsPerUnit: 1, listPrice: 800, price: 650, aliases: [], sortOrder: 1, active: true, createdAt: t, updatedAt: t }]);
    const s = await createSale({ eventId: 'zz-ev', phone: '9913803737', lines: [{ passTypeId: 'zz-pt', qty: 1 }], payments: [{ amount: 650, method: 'cash', receiverId: 'zz-rc' }] });
    await syncOnce(srv.send);
    on(A); await syncOnce(srv.send);      // A has the deterministic seed rows; receives the old phone's rows
    const liveEv = (await db.events.toArray()).filter((e) => e.date === '2026-10-16' && !e.deletedAt);
    expect(liveEv).toHaveLength(1);
    const sale = (await db.sales.get(s.id))!; expect(liveEv[0]!.id).toBe(sale.eventId);
    expect((await db.receivers.toArray()).filter((r) => r.nameLower === 'bhanderi raj' && !r.deletedAt)).toHaveLength(1);
    expect((await db.passTypes.toArray()).filter((p) => p.name === 'Solo' && !p.deletedAt)).toHaveLength(1);
    const pay = (await db.payments.toArray())[0]!; expect((await db.receivers.get(pay.receiverId!))!.deletedAt).toBeUndefined();
    void old;
  });

  it('a big first upload is sent in batches and everything arrives', async () => {
    on(A); const ev = (await db.events.toArray())[0]!; const solo = (await db.passTypes.orderBy('sortOrder').toArray())[0]!;
    for (let i = 0; i < 40; i++) await createSale({ eventId: ev.id, phone: '9' + String(100000000 + i), lines: [{ passTypeId: solo.id, qty: 1 }] });
    const r = await syncOnce(srv.send); expect(r.pushed).toBeGreaterThan(80);
    on(B); await syncOnce(srv.send); expect(await db.sales.count()).toBe(40);
  });

  it('syncing again with nothing new is cheap and stable', async () => {
    on(A); await syncOnce(srv.send); const before = await db.sales.count(); const r = await syncOnce(srv.send);
    expect(await db.sales.count()).toBe(before); expect(r.pulled).toBe(0);
  });
});
