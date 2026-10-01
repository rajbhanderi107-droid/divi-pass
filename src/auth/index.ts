import { useSyncExternalStore } from 'react';
import { db } from '../db/schema';
import { seedIfEmpty } from '../db/seed';

/** The project address and its public key are meant to sit in the app; they open nothing by themselves. */
export const API_URL = 'https://cndndjgknjulrfutixvx.supabase.co';
export const PUBLIC_KEY = 'sb_publishable_9RYNarJJyPduOToQRcu48w_94ZS-KFo';
export const FN_URL = `${API_URL}/functions/v1/sync`;
const LOGIN_DOMAIN = 'login.divipass.app';

export type Role = 'super' | 'admin' | 'seller';
export interface Profile { login: string; name: string; role: Role; personId: string | null; googleEmail?: string | null; passwordLogin?: boolean }
interface Session { access: string; refresh: string; expiresAt: number }
export type AuthState = { status: 'loading' } | { status: 'out'; message?: string } | { status: 'in'; profile: Profile };

export class AuthError extends Error { constructor(m: string, public kind: 'denied' | 'offline' | 'failed') { super(m); } }

export const loginEmail = (id: string) => { const s = id.trim().toLowerCase(); return s.includes('@') ? s : `${s}@${LOGIN_DOMAIN}`; };

/** Reads the tokens Google/Supabase put in the address after sign-in (`#access_token=…`). Returns null for any other address. */
export function parseAuthHash(hash: string): { session?: Session; error?: string } | null {
  const h = hash.replace(/^#\/?/, '');
  if (!/(^|&)(access_token|error)=/.test(h)) return null;
  const q = new URLSearchParams(h);
  const err = q.get('error_description') ?? q.get('error');
  if (err) return { error: err.replace(/\+/g, ' ') };
  const access = q.get('access_token'); const refresh = q.get('refresh_token'); const exp = Number(q.get('expires_in') ?? 3600);
  if (!access || !refresh) return { error: 'Sign-in did not finish. Try again.' };
  return { session: { access, refresh, expiresAt: Date.now() + exp * 1000 } };
}

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();
const set = (s: AuthState) => { state = s; listeners.forEach((l) => l()); };
export const useAuth = (): AuthState => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state);
export const currentProfile = (): Profile | null => (state.status === 'in' ? state.profile : null);

const getSet = async <T,>(k: string) => (await db.settings.get(k))?.value as T | undefined;
const putSet = (k: string, value: unknown) => db.settings.put({ key: k, value });

async function tokenRequest(grant: 'password' | 'refresh_token', body: Record<string, string>): Promise<Session> {
  let res: Response;
  try { res = await fetch(`${API_URL}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: PUBLIC_KEY }, body: JSON.stringify(body) }); }
  catch { throw new AuthError('No internet', 'offline'); }
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token || !j.refresh_token) throw new AuthError(grant === 'password' ? 'Wrong login id or password' : 'Session ended', res.status >= 500 ? 'failed' : 'denied');
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

let refreshing: Promise<Session | null> | null = null;
/** A usable access token, refreshed when it is about to run out. Null when signed out or offline with an expired one. */
export async function getToken(force = false): Promise<string | null> {
  const s = await getSet<Session>('session');
  if (!s) return null;
  if (!force && s.expiresAt - Date.now() > 60_000) return s.access;
  refreshing ??= (async () => {
    try { const n = await tokenRequest('refresh_token', { refresh_token: s.refresh }); await putSet('session', n); return n; }
    catch (e) { if (e instanceof AuthError && e.kind === 'denied') await endSession('Signed out — please sign in again.'); return null; }
    finally { refreshing = null; }
  })();
  return (await refreshing)?.access ?? null;
}

/** Calls the server as the signed-in person. */
export async function api<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    if (!token) throw new AuthError('Not signed in', 'denied');
    let res: Response;
    try { res = await fetch(FN_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, apikey: PUBLIC_KEY }, body: JSON.stringify({ action, ...body }) }); }
    catch { throw new AuthError('No internet', 'offline'); }
    const j = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 401 || res.status === 403) throw new AuthError(j.error ?? 'Not allowed', 'denied');
    if (!res.ok) throw new AuthError(j.error ?? `Server error (${res.status})`, 'failed');
    return j;
  }
  throw new AuthError('Not signed in', 'denied');
}

const TABLES = () => [db.events, db.passTypes, db.customers, db.sales, db.payments, db.receivers, db.expenses, db.attachments, db.inbox, db.auditLog, db.settings];
/** Empties this phone's copy — used when a different person signs in, so nobody sees another seller's book. */
async function wipeLocal() { await db.transaction('rw', TABLES(), async () => { for (const t of TABLES()) await t.clear(); }); }

async function adopt(session: Session): Promise<void> {
  await putSet('session', session);
  let me: { user: Profile & { passwordLogin?: boolean } };
  try { me = await api<typeof me>('me'); }
  catch (e) { await db.settings.delete('session'); throw e; }
  const p = me.user;
  const owner = await getSet<string>('dataOwner');
  const hasData = (await db.sales.count()) > 0;
  // Data from another person, or unowned data on a seller's phone, must not stay here.
  if ((owner && owner !== p.login) || (!owner && hasData && p.role !== 'super')) { await wipeLocal(); await seedIfEmpty(); await putSet('session', session); }
  await seedIfEmpty();
  await putSet('dataOwner', p.login); await putSet('profile', p);
  set({ status: 'in', profile: p });
}

export async function signIn(login: string, password: string): Promise<void> {
  const s = await tokenRequest('password', { email: loginEmail(login), password });
  try { await adopt(s); } catch (e) { set({ status: 'out' }); throw e; }
}

export function signInWithGoogle(): void {
  const back = location.origin + location.pathname;
  location.assign(`${API_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`);
}

async function endSession(message?: string) {
  await db.settings.delete('session'); await db.settings.delete('profile');
  set({ status: 'out', message });
}
/** Signs out and empties this phone's copy (it comes back from the cloud on the next sign-in). */
export async function signOut(): Promise<void> { await wipeLocal(); await endSession(); }

let booted = false;
/** Runs once at start: finishes a Google sign-in if we just came back from one, else restores the saved sign-in. */
export async function bootAuth(): Promise<void> {
  if (booted) return; booted = true;
  const back = parseAuthHash(location.hash);
  if (back) {
    history.replaceState(null, '', location.pathname + '#/');
    if (back.session) { try { await adopt(back.session); return; } catch (e) { await endSession(e instanceof Error ? e.message : 'Could not sign in'); return; } }
    await endSession(back.error); return;
  }
  const [s, p] = await Promise.all([getSet<Session>('session'), getSet<Profile>('profile')]);
  if (s && p) { set({ status: 'in', profile: p }); void refreshProfile(); } else set({ status: 'out' });
}

/** Keeps role and name fresh; drops the sign-in if the account was switched off. Ignored when offline. */
export async function refreshProfile(): Promise<void> {
  try {
    const me = await api<{ user: Profile }>('me');
    await putSet('profile', me.user); set({ status: 'in', profile: me.user });
  } catch (e) { if (e instanceof AuthError && e.kind === 'denied') await endSession(e.message); }
}
