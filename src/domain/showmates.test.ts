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
