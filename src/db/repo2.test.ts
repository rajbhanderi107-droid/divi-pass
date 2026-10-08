import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiviDB, db, useDatabase } from './schema';
import { seedIfEmpty } from './seed';
import { addExpense, addPayment, attachToPayment, createSale, deleteExpense, deleteSale, mergeSales, purgeTrash, setEntered, setNightPrices, ValidationError } from './repo';
import { applyImport, buildBackup, parseBackup } from './backup';
import { nightStats, summaryText } from '../domain/report';
import { priceFor } from '../domain/pricing';
import { csvCell, toCsv } from '../domain/csv';
import type { SaleView } from './queries';
import { payStatus, amountDue } from '../domain/status';
import { hashText } from '../parser';
import type { EventNight } from '../domain/types';

let n = 0;
let ev: EventNight; let ev2: EventNight; let solo: { id: string }; let couple: { id: string };
beforeEach(async () => {
  useDatabase(new DiviDB('r' + n++)); await seedIfEmpty();
  const events = await db.events.orderBy('date').toArray(); ev = events.find((e) => e.date === '2026-10-16')!; ev2 = events.find((e) => e.date === '2026-10-17')!;
  const pts = await db.passTypes.orderBy('sortOrder').toArray(); solo = pts[0]!; couple = pts[1]!;
});
const mk = (over: Partial<Parameters<typeof createSale>[0]> = {}) => createSale({ eventId: ev.id, name: 'A', phone: '9913803737', lines: [{ passTypeId: solo.id, qty: 2 }], ...over });

describe('merge sales', () => {
  it('combines lines, moves payments, trashes the other, keeps totals right', async () => {
    const a = await mk({ payments: [{ amount: 1300, method: 'upi', utr: '627325985997' }] });
    const b = await mk({ lines: [{ passTypeId: solo.id, qty: 3 }, { passTypeId: couple.id, qty: 1 }], payments: [{ amount: 500, method: 'cash' }] });
    const m = await mergeSales(a.id, b.id);
    expect(m.lines.find((l) => l.passTypeId === solo.id)!.qty).toBe(5);
    expect(m.total).toBe(1300 + 1950 + 1300); expect(m.seats).toBe(5 + 2);
    const pays = (await db.payments.where('saleId').equals(a.id).toArray());
    expect(pays).toHaveLength(2);
    expect((await db.sales.get(b.id))!.deletedAt).toBeTruthy();
    expect(payStatus(m, pays)).toBe('partial'); expect(amountDue(m, pays)).toBe(m.total - 1800);
  });
  it('refuses different night / different buyer / cancelled', async () => {
    const a = await mk(); const other = await createSale({ eventId: ev2.id, phone: '9913803737', lines: [{ passTypeId: solo.id, qty: 1 }] });
    await expect(mergeSales(a.id, other.id)).rejects.toThrow('same night');
    const diff = await createSale({ eventId: ev.id, phone: '9426672046', lines: [{ passTypeId: solo.id, qty: 1 }] });
    await expect(mergeSales(a.id, diff.id)).rejects.toThrow('same buyer');
    await expect(mergeSales(a.id, a.id)).rejects.toThrow(ValidationError);
  });
});

describe('gate check-in', () => {
  it('counts partial group entry within seats', async () => {
    const s = await mk({ lines: [{ passTypeId: couple.id, qty: 2 }] }); // 4 seats
    await setEntered(s.id, 3); expect((await db.sales.get(s.id))!.entered).toBe(3);
    await expect(setEntered(s.id, 5)).rejects.toThrow('between 0 and 4');
    await expect(setEntered(s.id, -1)).rejects.toThrow();
  });
});

describe('night prices', () => {
  it('a night can have its own price; other nights keep the default; old sales unchanged', async () => {
    const before = await mk();
    await setNightPrices(ev.id, { [solo.id]: 500 });
    const a = await mk(); const b = await createSale({ eventId: ev2.id, phone: '9426672046', lines: [{ passTypeId: solo.id, qty: 2 }] });
    expect(a.total).toBe(1000); expect(b.total).toBe(1300); expect((await db.sales.get(before.id))!.total).toBe(1300);
    expect(priceFor({ id: solo.id, price: 650 }, await db.events.get(ev.id))).toBe(500);
    await expect(setNightPrices(ev.id, { [solo.id]: 5.5 })).rejects.toThrow();
  });
});

describe('expenses and reports', () => {
  it('night stats: collected, due, unpunched, expenses, net, per receiver', async () => {
    const [raj, dev] = await db.receivers.toArray();
    const a = await mk({ payments: [{ amount: 1300, method: 'upi', utr: '627325985997', receiverId: raj!.id }] });
    const b = await mk({ phone: '9426672046', payments: [{ amount: 650, method: 'upi', utr: '627326018483', receiverId: dev!.id }] });
    await addExpense({ eventId: ev.id, label: 'Sound', amount: 500 });
    const ex = await addExpense({ eventId: ev.id, label: 'Gone', amount: 999 }); await deleteExpense(ex.id);
    const views = (await Promise.all([a, b].map(async (s) => { const ps = await db.payments.where('saleId').equals(s.id).toArray(); return { sale: (await db.sales.get(s.id))!, payments: ps, status: payStatus(s, ps), due: amountDue(s, ps) } as unknown as SaleView; })));
    const st = nightStats(ev, views, await db.expenses.toArray());
    expect(st).toMatchObject({ sales: 2, seats: 4, revenue: 2600, collected: 1950, due: 650, unpunched: 2, expenses: 500, net: 1450 });
    expect(st.byReceiver[raj!.id]).toBe(1300); expect(st.byReceiver[dev!.id]).toBe(650);
    expect(summaryText(st)).toContain('Collected: ₹1,950 · Due: ₹650');
    await expect(addExpense({ eventId: ev.id, label: '', amount: 5 })).rejects.toThrow(); await expect(addExpense({ eventId: ev.id, label: 'x', amount: 1.5 })).rejects.toThrow();
  });
});

describe('attachments and backup', () => {
  it('stores a screenshot, replaces it, purges with the sale, and backup includes expenses but not images', async () => {
    const s = await mk({ payments: [{ amount: 1300, method: 'upi', utr: '627325985997' }] });
    const p = (await db.payments.where('saleId').equals(s.id).toArray())[0]!;
    const id1 = await attachToPayment(p.id, new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }));
    const id2 = await attachToPayment(p.id, new Blob([new Uint8Array(2000)], { type: 'image/jpeg' }));
    expect((await db.payments.get(p.id))!.attachmentId).toBe(id2); expect((await db.attachments.get(id1))!.deletedAt).toBeTruthy();
    await expect(attachToPayment(p.id, new Blob([new Uint8Array(500_000)]))).rejects.toThrow('too large');
    await addExpense({ eventId: ev.id, label: 'Sound', amount: 500 });
    const text = JSON.stringify(await buildBackup()); const file = parseBackup(text);
    expect(file.tables.expenses).toHaveLength(1); expect(Object.keys(file.tables)).not.toContain('attachments');
    await deleteSale(s.id); await purgeTrash(-1);
    expect(await db.attachments.count()).toBe(0);
    await applyImport(file); expect(await db.expenses.count()).toBe(1);
  });
  it('a v1 backup file (no expenses table) still restores', async () => {
    await mk(); const f = await buildBackup(); delete (f.tables as Record<string, unknown>).expenses;
    const old = { ...f, schemaVersion: 1, checksum: hashText(JSON.stringify(f.tables)) }; const text = JSON.stringify(old);
    useDatabase(new DiviDB('r' + n++)); await applyImport(parseBackup(text)); expect(await db.sales.count()).toBe(1);
  });
});

describe('csv', () => {
  it('escapes quotes/commas/newlines and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""'); expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)"); expect(csvCell('+91 99')).toBe("'+91 99"); expect(csvCell(-5)).toBe('-5'); expect(csvCell(undefined)).toBe('');
    expect(toCsv([['a', 1], ['b', 2]])).toBe('﻿a,1\r\nb,2\r\n');
  });
});

describe('season follows the nights', () => {
  it('stretches to a later night added after the phone was set up', async () => {
    const { extendSeason, seedIfEmpty } = await import('./seed');
    await seedIfEmpty();
    await db.events.put({ id: 'ev-2026-10-25', date: '2026-10-25', name: 'x', createdAt: 1, updatedAt: 1 });
    await extendSeason();
    expect(((await db.settings.get('season'))!.value as { to: string }).to).toBe('2026-10-25');
  });
});
