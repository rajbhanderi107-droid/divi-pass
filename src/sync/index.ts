import { useSyncExternalStore } from 'react';
import { db, SYNC_TABLES } from '../db/schema';
import { applying, syncOnce, type SyncResponse, type SyncRow } from './engine';
import { setSetting } from '../db/repo';

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'offline' | 'badkey' | 'error';
export interface SyncStatus { state: SyncState; lastOk?: number; error?: string; pushed?: number; pulled?: number }

let status: SyncStatus = { state: 'off' };
const listeners = new Set<() => void>();
const set = (s: SyncStatus) => { status = s; listeners.forEach((l) => l()); };
export const useSyncStatus = (): SyncStatus => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => status);

class SyncError extends Error { constructor(m: string, public kind: 'badkey' | 'offline' | 'error') { super(m); } }

export interface SyncConfig { url: string; key: string }
export async function getConfig(): Promise<SyncConfig | null> {
  const [u, k, on] = await Promise.all([db.settings.get('syncUrl'), db.settings.get('syncKey'), db.settings.get('syncOn')]);
  return on?.value && u?.value && k?.value ? { url: String(u.value), key: String(k.value) } : null;
}

const transportFor = (cfg: SyncConfig) => async (req: { since: number; push: SyncRow[] }): Promise<SyncResponse> => {
  let res: Response;
  try { res = await fetch(cfg.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: cfg.key, ...req }) }); }
  catch { throw new SyncError('No internet', 'offline'); }
  const body = (await res.json().catch(() => ({}))) as Partial<SyncResponse> & { error?: string };
  if (res.status === 401) throw new SyncError('Wrong sync key', 'badkey');
  if (!res.ok || !Array.isArray(body.rows)) throw new SyncError(body.error ?? `Server error (${res.status})`, 'error');
  return { rows: body.rows, cursor: Number(body.cursor ?? req.since), more: !!body.more };
};

let running: Promise<void> | null = null; let again = false;
/** Sync now; calls made while one is running are folded into one follow-up run. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const cfg = await getConfig();
      if (!cfg) { set({ state: 'off' }); return; }
      set({ ...status, state: 'syncing', error: undefined });
      try {
        const r = await syncOnce(transportFor(cfg));
        set({ state: 'ok', lastOk: Date.now(), pushed: r.pushed, pulled: r.pulled });
      } catch (e) {
        const k = e instanceof SyncError ? e.kind : 'error';
        set({ ...status, state: k, error: e instanceof Error ? e.message : 'Sync failed' });
      }
    } finally { running = null; if (again) { again = false; void syncNow(); } }
  })();
  return running;
}

export async function connectSync(url: string, key: string): Promise<void> {
  await setSetting('syncUrl', url.trim()); await setSetting('syncKey', key.trim()); await setSetting('syncOn', true);
  await setSetting('syncCursor', 0); await setSetting('syncPushedAt', 0);   // first sync sends everything and takes everything
  await syncNow();
}
export async function disconnectSync(): Promise<void> { await setSetting('syncOn', false); set({ state: 'off' }); }

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
  void getConfig().then((c) => { if (c) void syncNow(); });
}
