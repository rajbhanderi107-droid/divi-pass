import { describe, expect, it } from 'vitest';
import { parseMessage } from '../parser';
import { planFromDraft } from './photoDraft';
import type { EventNight, PassType, Receiver } from './types';

const b = { createdAt: 0, updatedAt: 0 };
const passTypes = [
  { id: 'solo', name: 'Solo', kind: 'solo', seatsPerUnit: 1, listPrice: 800, price: 650, aliases: [], sortOrder: 1, active: true, ...b, },
  { id: 'couple', name: 'Couple', kind: 'couple', seatsPerUnit: 2, listPrice: 1600, price: 1300, aliases: [], sortOrder: 2, active: true, ...b },
] as unknown as PassType[];
const events = [{ id: 'e16', date: '2026-10-16', name: 'x', ...b }] as unknown as EventNight[];
const receivers = [{ id: 'raj', name: 'Bhanderi Raj', nameLower: 'bhanderi raj', ...b }] as unknown as Receiver[];
const opt = { today: '2026-09-30', prices: { solo: 650, couple: 1300 } };
const plan = (t: string, fromPhoto = true) => planFromDraft(parseMessage(t, opt)[0]!, { passTypes, events, receivers, lastReceiverId: '', fromPhoto });

const SALE = 'Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday';

describe('auto-save decision', () => {
  it("the user's WhatsApp screenshot is clear enough to save directly", () => {
    const p = plan(SALE);
    expect(p.autoOk).toBe(true); expect(p.eventId).toBe('e16'); expect(p.qty).toEqual({ solo: 2 }); expect(p.phone).toBe('9913803737'); expect(p.name).toBe('Niyati Patel');
    expect(p.pays).toEqual([]);
  });
  it('payment photo amount that equals the total is recorded as paid (no UTR)', () => {
    const p = plan(SALE + '\n₹1,300');
    expect(p.autoOk).toBe(true); expect(p.pays).toMatchObject([{ amount: 1300, utr: '' }]);
  });
  it('same bare amount typed in a pasted message (not a photo) is NOT treated as payment', () => {
    expect(plan(SALE + '\n₹1,300', false).pays).toEqual([]);
  });
  it('full payment card with UTR + payer is recorded to that receiver', () => {
    const p = plan(SALE + '\n\n₹1,300\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997');
    expect(p.autoOk).toBe(true); expect(p.pays).toMatchObject([{ amount: 1300, utr: '627325985997', receiverId: 'raj' }]);
  });
  it.each([
    ['no date', 'Name: A\nPass : 2 solo\nNo : 9913803737'],
    ['bad phone', 'Name: A\nPass : 2 solo\nNo : 99138\nDate : 16 oct'],
    ['unclear pass', 'Name: A\nPass : 3\nNo : 9913803737\nDate : 16 oct'],
    ['unreadable digit', 'Name: A\nPass : 2 solo\nNo : 99138?3737\nDate : 16 oct'],
    ['night not in list', 'Name: A\nPass : 2 solo\nNo : 9913803737\nDate : 17 oct'],
    ['weekday mismatch', 'Name: A\nPass : 2 solo\nNo : 9913803737\nDate : 16 oct Monday'],
    ['amount differs from price list', SALE + '\nTotal 1000'],
    ['paid more than total', SALE + '\n\n₹5,000\nPaid to Bhanderi Raj\n30 Sep 2026, 1:06 pm\nUPI transaction ID 627325985997'],
  ])('falls back to review: %s', (_n, t) => expect(plan(t).autoOk).toBe(false));
});
