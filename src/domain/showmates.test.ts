import { expect, it } from 'vitest';
import { punchBlocks } from './showmates';
import type { Sale } from './types';

const line = (name: string, qty: number, unit: number, punchedAt?: number) => ({ passTypeId: name, nameSnap: name, seatsPerUnitSnap: 1, listPriceSnap: 800, unitPriceSnap: unit, qty, punchedAt });
const sale = (lines: Sale['lines'], discount = 0) => ({ lines, discount } as Sale);
const cust = { name: 'Vanshika Banodia', phone: '+919313585913' };

it('5 solo copies the actual amount 3250, not the ₹800 list price', () => {
  const [b] = punchBlocks(sale([line('Solo', 5, 650)]), cust, '2026-10-16');
  expect(b!.amount).toBe(3250);
  expect(b!.text).toContain('Manual amount: 3250');
  expect(b!.text).toContain('Phone: 9313585913');
});
it('one block per unpunched line only', () => {
  const r = punchBlocks(sale([line('Couple', 1, 1300, 1), line('Solo', 2, 650)]), cust, '2026-10-16');
  expect(r.map((x) => x.index)).toEqual([1]);
});
it('discount comes off the first line', () => {
  const r = punchBlocks(sale([line('Solo', 2, 650)], 100), cust, '2026-10-16');
  expect(r[0]!.amount).toBe(1200);
});

import { punchQueue } from './showmates';
const s2 = (over: Partial<Sale>) => ({ discount: 0, lines: [], createdAt: 1, ...over }) as Sale;

it('fields come in the Punch form order and use the Showmates ticket label when set', () => {
  const [b] = punchBlocks(s2({ lines: [{ ...line('Solo', 2, 650), ticketSnap: 'EARLY BIRD | SINGLE' }] }), cust, '2026-10-16');
  expect(b!.fields.map((f) => f.label)).toEqual(['Date', 'Ticket', 'Quantity', 'Manual amount', 'Buyer name', 'Phone']);
  expect(b!.fields[1]!.value).toBe('EARLY BIRD | SINGLE'); expect(b!.fields[3]!.value).toBe('1300');
});
it('queue is oldest first, one entry per unpunched line, cancelled sales skipped', () => {
  const q = punchQueue([
    { sale: s2({ id: 'b', createdAt: 20, lines: [line('Solo', 1, 650)] }), customer: cust, night: '2026-10-16' },
    { sale: s2({ id: 'a', createdAt: 10, lines: [line('Couple', 1, 1300, 5), line('Solo', 2, 650)] }), customer: cust, night: '2026-10-16' },
    { sale: s2({ id: 'c', createdAt: 5, cancelledAt: 1, lines: [line('Solo', 1, 650)] }), customer: cust, night: '2026-10-16' },
  ]);
  expect(q.map((x) => x.sale.id + ':' + x.block.index)).toEqual(['a:1', 'b:0']);
});
