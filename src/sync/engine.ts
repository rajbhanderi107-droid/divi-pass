import { db, SYNC_TABLES, type SyncTable } from '../db/schema';

export interface SyncRow { t: SyncTable; id: string; data: Record<string, unknown> & { id: string; updatedAt: number }; updatedAt: number }
export interface SyncResponse { rows: SyncRow[]; cursor: number; more: boolean }
export type Transport = (req: { since: number; push: SyncRow[] }) => Promise<SyncResponse>;
export interface SyncResult { pushed: number; pulled: number }

/** While rows arrive from the cloud, local change hooks must not schedule another sync. */
export const applying = { on: false };

const BATCH = 300;
const num = async (k: string) => Number((await db.settings.get(k))?.value ?? 0) || 0;

/** Copy a cloud row over the local one only when it is newer (last writer wins). */
async function applyRows(rows: SyncRow[]): Promise<number> {
  const by = new Map<SyncTable, SyncRow[]>();
  for (const r of rows) {
    if (!SYNC_TABLES.includes(r.t) || !r.data || r.data.id !== r.id || !Number.isFinite(r.updatedAt)) continue;
    (by.get(r.t) ?? by.set(r.t, []).get(r.t)!).push(r);
  }
  if (by.size === 0) return 0;
  let n = 0;
  applying.on = true;
  try {
    await db.transaction('rw', [...by.keys()].map((t) => db.table(t)), async () => {
      for (const [t, list] of by) {
        const tbl = db.table(t);
        const local = (await tbl.bulkGet(list.map((r) => r.id))) as ({ updatedAt: number } | undefined)[];
        const fresh = list.filter((r, i) => !local[i] || local[i]!.updatedAt < r.updatedAt).map((r) => ({ ...r.data, updatedAt: r.updatedAt }));
        if (fresh.length) { await tbl.bulkPut(fresh); n += fresh.length; }
      }
    });
  } finally { applying.on = false; }
  return n;
}

/** Push what changed here, pull what changed there. Safe to call any time, as often as you like. */
export async function syncOnce(send: Transport): Promise<SyncResult> {
  let cursor = await num('syncCursor'); const pushedAt = await num('syncPushedAt');
  const out: SyncRow[] = []; let maxU = pushedAt;
  for (const t of SYNC_TABLES) {
    const rows = (await db.table(t).where('updatedAt').aboveOrEqual(pushedAt).toArray()) as (SyncRow['data'])[];
    for (const r of rows) { out.push({ t, id: r.id, data: r, updatedAt: r.updatedAt }); if (r.updatedAt > maxU) maxU = r.updatedAt; }
  }
  let pulled = 0; let more = false;
  for (let i = 0; i === 0 || i < out.length; i += BATCH) {
    const res = await send({ since: cursor, push: out.slice(i, i + BATCH) });
    pulled += await applyRows(res.rows); cursor = res.cursor; more = res.more;
  }
  while (more) { const res = await send({ since: cursor, push: [] }); pulled += await applyRows(res.rows); cursor = res.cursor; more = res.more; }
  await db.settings.bulkPut([{ key: 'syncCursor', value: cursor }, { key: 'syncPushedAt', value: maxU }]);
  if (pulled) await reconcileSeeds();
  return { pushed: out.length, pulled };
}

/**
 * Two phones that each created their own starting nights / passes / receivers end up with duplicates once they sync.
 * Keep the most recently edited copy of each, hide the others, and point sales/payments at the survivor.
 */
export async function reconcileSeeds(): Promise<void> {
  const now = Date.now();
  const live = <T extends { deletedAt?: number }>(r: T[]) => r.filter((x) => !x.deletedAt);
  const pick = <T extends { id: string; updatedAt: number }>(g: T[]) => [...g].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0]!;
  await db.transaction('rw', [db.events, db.passTypes, db.receivers, db.sales, db.payments, db.expenses], async () => {
    const groups = async <T extends { id: string }>(rows: T[], key: (r: T) => string) => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r); return [...m.values()].filter((g) => g.length > 1); };
    for (const g of await groups(live(await db.events.toArray()), (e) => e.date)) {
      const keep = pick(g);
      for (const d of g.filter((x) => x.id !== keep.id)) {
        await db.sales.where('eventId').equals(d.id).modify({ eventId: keep.id, updatedAt: now });
        await db.expenses.where('eventId').equals(d.id).modify({ eventId: keep.id, updatedAt: now });
        await db.events.update(d.id, { deletedAt: now, updatedAt: now });
      }
    }
    for (const g of await groups(live(await db.passTypes.toArray()), (p) => `${p.kind}|${p.name.trim().toLowerCase()}`)) {
      const keep = pick(g);
      for (const d of g.filter((x) => x.id !== keep.id)) await db.passTypes.update(d.id, { deletedAt: now, updatedAt: now });
    }
    for (const g of await groups(live(await db.receivers.toArray()), (r) => r.nameLower)) {
      const keep = pick(g);
      for (const d of g.filter((x) => x.id !== keep.id)) {
        await db.payments.where('receiverId').equals(d.id).modify({ receiverId: keep.id, updatedAt: now });
        await db.expenses.filter((e) => e.receiverId === d.id).modify({ receiverId: keep.id, updatedAt: now });
        await db.receivers.update(d.id, { deletedAt: now, updatedAt: now });
      }
    }
  });
}
