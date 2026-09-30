import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseRupees, formatINR } from './money';
import { istDate, istToEpoch, weekdayName } from './time';
import { normalizePhone } from './phone';
import { payStatus, computePunchState, computeTotal } from './status';

describe('money', () => {
  it('parses', () => {
    expect(parseRupees('₹1,300')).toBe(1300);
    expect(parseRupees('Rs. 2600/-')).toBe(2600);
    expect(parseRupees('3.25k')).toBe(3250);
    expect(parseRupees('800.50')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
  });
  it('formats en-IN', () => expect(formatINR(325000)).toBe('₹3,25,000'));
});
describe('time (IST)', () => {
  it('istDate ignores device tz', () => {
    expect(istDate(Date.UTC(2026, 9, 15, 19, 0))).toBe('2026-10-16'); // 00:30 IST next day
    expect(istDate(Date.UTC(2026, 9, 15, 18, 29))).toBe('2026-10-15');
  });
  it('round trip', () => expect(istDate(istToEpoch('2026-10-16', 1, 0))).toBe('2026-10-16'));
  it('weekday', () => { expect(weekdayName('2026-10-16')).toBe('Friday'); expect(weekdayName('2026-10-12')).toBe('Monday'); });
});
describe('phone', () => {
  it.each(['+919913803737', '9913803737', '09913803737', '91 99138 03737', '+91-99138-03737'])('%s', (s) => expect(normalizePhone(s)).toBe('+919913803737'));
  it('rejects', () => { expect(normalizePhone('5913803737')).toBeNull(); expect(normalizePhone('627326018483')).toBeNull(); });
});
describe('status', () => {
  const pay = (kind: 'receipt' | 'refund', amount: number) => ({ kind, amount });
  it('derives', () => {
    const s = { total: 3250 };
    expect(payStatus(s, [])).toBe('unpaid');
    expect(payStatus(s, [pay('receipt', 2600)])).toBe('partial');
    expect(payStatus(s, [pay('receipt', 2600), pay('receipt', 650)])).toBe('paid');
    expect(payStatus(s, [pay('receipt', 4000)])).toBe('overpaid');
    expect(payStatus({ total: 3250, cancelledAt: 1 }, [pay('receipt', 650)])).toBe('refundDue');
    expect(payStatus({ total: 3250, cancelledAt: 1 }, [pay('receipt', 650), pay('refund', 650)])).toBe('cancelled');
  });
  it('punch state per line', () => {
    expect(computePunchState([{}, {}])).toBe('none');
    expect(computePunchState([{ punchedAt: 1 }, {}])).toBe('partial');
    expect(computePunchState([{ punchedAt: 1 }, { punchedAt: 2 }])).toBe('done');
  });
  it('property: total is always an integer', () =>
    fc.assert(fc.property(fc.array(fc.record({ qty: fc.integer({ min: 1, max: 20 }), unitPriceSnap: fc.integer({ min: 0, max: 5000 }) }), { minLength: 1 }), (ls) =>
      Number.isInteger(computeTotal(ls, 0)))));
});
