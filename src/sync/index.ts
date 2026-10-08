import { useSyncExternalStore } from 'react';
import { db, SYNC_TABLES } from '../db/schema';
import { applying, syncOnce, type SyncResponse, type SyncRow } from './engine';
import { api, AuthError, currentProfile } from '../auth';
import { extendSeason } from '../db/seed';

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'offline' | 'auth' | 'error';
export interface SyncStatus { state: SyncState; lastOk?: number; error?: string; pushed?: number; pulled?: number }

let status: SyncStatus = { state: 'off' };
const listeners = new Set<() => void>();
const set = (s: SyncStatus) => { status = s; listeners.forEach((l) => l()); };
export const useSyncStatus = (): SyncStatus => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => status);

export const transport = async (req: { since: number; push: SyncRow[] }): Promise<SyncResponse> => {
  try {
    const body = await api<Partial<SyncResponse>>('sync', req);
    if (!Array.isArray(body.rows)) throw new AuthError('Server error', 'failed');
    return { rows: body.rows, cursor: Number(body.cursor ?? req.since), more: !!body.more };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('Sync failed', 'failed');
  }
};

let running: Promise<void> | null = null; let again = false;
/** Sync now; calls made while one is running are folded into one follow-up run. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      await null;   // let `running` be assigned before the body can finish
      if (!currentProfile()) { set({ state: 'off' }); return; }
      set({ ...status, state: 'syncing', error: undefined });
      try {
        const r = await syncOnce(transport);
        if (r.pulled) await extendSeason();
        set({ state: 'ok', lastOk: Date.now(), pushed: r.pushed, pulled: r.pulled });
      } catch (e) {
        const k = e instanceof AuthError ? (e.kind === 'offline' ? 'offline' : e.kind === 'denied' ? 'auth' : 'error') : 'error';
        set({ ...status, state: k, error: e instanceof Error ? e.message : 'Sync failed' });
      }
    } finally { running = null; if (again) { again = false; void syncNow(); } }
  })();
  return running;
}

let started = false; let timer: ReturnType<typeof setTimeout> | undefined;
const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, ms); };

/** Wire up automatic syncing: after edits, on a timer while the app is open, when the phone comes back online. */
export function startSync(): void {
  if (started) return; started = true;
  for (const t of SYNC_TABLES) {
    const tbl = db.table(t);
    const poke = () => { if (!applying.on) later(1500); };
    tbl.hook('creating', () => { poke(); }); tbl.hook('updating', () => { poke(); }); tbl.hook('deleting', () => { poke(); });
  }
  window.addEventListener('online', () => { void syncNow(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(); });
  setInterval(() => { if (!document.hidden) void syncNow(); }, 20_000);
  void syncNow();
}
