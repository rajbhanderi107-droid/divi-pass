import { ulid } from 'ulid';
import { db } from './schema';

const NIGHTS = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'];

/** Editable starting setup, created once. Prices from the organiser's own messages (Solo ₹650); Couple is assumed. */
export async function seedIfEmpty() {
  await db.transaction('rw', [db.events, db.passTypes, db.receivers, db.settings], async () => {
    if ((await db.settings.get('seeded'))?.value) return;
    const t = Date.now();
    await db.events.bulkAdd(NIGHTS.map((date) => ({ id: ulid(), date, name: 'Divya Achariya Divi', createdAt: t, updatedAt: t })));
    await db.passTypes.bulkAdd([
      { id: ulid(), name: 'Solo', kind: 'solo', seatsPerUnit: 1, listPrice: 800, price: 650, aliases: ['solo', 'single', 'stag'], sortOrder: 1, active: true, createdAt: t, updatedAt: t },
      { id: ulid(), name: 'Couple', kind: 'couple', seatsPerUnit: 2, listPrice: 1600, price: 1300, aliases: ['couple', 'cpl', 'pair', 'jodi'], sortOrder: 2, active: true, createdAt: t, updatedAt: t },
    ]);
    await db.receivers.bulkAdd(['Bhanderi Raj', 'Dev Kinner Trivedi'].map((name) => ({ id: ulid(), name, nameLower: name.toLowerCase(), createdAt: t, updatedAt: t })));
    await db.settings.bulkPut([
      { key: 'seeded', value: true }, { key: 'season', value: { from: NIGHTS[0], to: NIGHTS[NIGHTS.length - 1] } },
      { key: 'refCounter', value: 0 }, { key: 'salesSinceBackup', value: 0 },
    ]);
  });
}
