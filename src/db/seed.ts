import { db } from './schema';

const NIGHTS = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];

/** Editable starting setup, created once. Fixed ids, so two phones that start from scratch agree on them.
 * Seed rows are stamped as the oldest possible change, so prices or names already set in the cloud always win over a phone's factory defaults. */
/** Nights added later (e.g. 20 Oct, or from another phone) must not read as "outside your nights": stretch the season to the last night. */
export async function extendSeason() {
  const [season, evs] = await Promise.all([db.settings.get('season'), db.events.toArray()]);
  const last = evs.filter((e) => !e.deletedAt).map((e) => e.date).sort().pop(); const cur = season?.value as { from: string; to: string } | undefined;
  if (cur && last && last > cur.to) await db.settings.put({ key: 'season', value: { from: cur.from, to: last } });
}

export async function seedIfEmpty() {
  await extendSeason();
  await db.transaction('rw', [db.events, db.passTypes, db.receivers, db.settings], async () => {
    if ((await db.settings.get('seeded'))?.value) return;
    const t = Date.now(); const OLDEST = 1;
    await db.events.bulkAdd(NIGHTS.map((date) => ({ id: `ev-${date}`, date, name: 'Divya Achariya Divi', createdAt: t, updatedAt: OLDEST })));
    await db.passTypes.bulkAdd([
      { id: 'pt-solo', name: 'Solo', kind: 'solo', seatsPerUnit: 1, listPrice: 800, price: 650, aliases: ['solo', 'single', 'stag'], sortOrder: 1, active: true, createdAt: t, updatedAt: OLDEST },
      { id: 'pt-couple', name: 'Couple', kind: 'couple', seatsPerUnit: 2, listPrice: 1600, price: 1300, aliases: ['couple', 'cpl', 'pair', 'jodi'], sortOrder: 2, active: true, createdAt: t, updatedAt: OLDEST },
    ]);
    await db.receivers.bulkAdd([['Bhanderi Raj'], ['Dev Kinner Trivedi'], ['Divya Achariya', 'rc-bhanderi-raj']].map(([name, agentOf]) => ({ id: 'rc-' + name!.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: name!, nameLower: name!.toLowerCase(), ...(agentOf ? { agentOf } : {}), createdAt: t, updatedAt: OLDEST })));
    await db.settings.bulkPut([
      { key: 'seeded', value: true }, { key: 'season', value: { from: NIGHTS[0], to: NIGHTS[NIGHTS.length - 1] } },
      { key: 'refCounter', value: 0 }, { key: 'salesSinceBackup', value: 0 },
    ]);
  });
}
