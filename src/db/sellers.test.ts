import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { seedIfEmpty } from './seed';
import { createSale, setAgentOf, setSeller } from './repo';

beforeEach(async () => { await db.delete(); await db.open(); await seedIfEmpty(); });

describe('sellers', () => {
  it('seeds Divya as an agent of Raj', async () => {
    const d = await db.receivers.get('rc-divya-achariya');
    expect(d?.agentOf).toBe('rc-bhanderi-raj');
  });
  it('stores and changes the seller on a sale', async () => {
    const pt = (await db.passTypes.orderBy('sortOrder').toArray())[0]!;
    const s = await createSale({ eventId: 'ev-2026-10-16', phone: '9000000001', lines: [{ passTypeId: pt.id, qty: 1 }], sellerId: 'rc-divya-achariya' });
    expect((await db.sales.get(s.id))?.sellerId).toBe('rc-divya-achariya');
    await setSeller(s.id, 'rc-dev-kinner-trivedi');
    expect((await db.sales.get(s.id))?.sellerId).toBe('rc-dev-kinner-trivedi');
    await setSeller(s.id, '');
    expect((await db.sales.get(s.id))?.sellerId).toBeUndefined();
  });
  it('agent link can be set and cleared', async () => {
    await setAgentOf('rc-dev-kinner-trivedi', 'rc-bhanderi-raj');
    expect((await db.receivers.get('rc-dev-kinner-trivedi'))?.agentOf).toBe('rc-bhanderi-raj');
    await setAgentOf('rc-dev-kinner-trivedi', '');
    expect((await db.receivers.get('rc-dev-kinner-trivedi'))?.agentOf).toBeUndefined();
  });
});
