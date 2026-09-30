import type { Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FakeUser { password: string; name: string; role: 'super' | 'admin' | 'seller'; personId?: string; disabled?: boolean; googleEmail?: string }
export interface Cloud { users: Record<string, FakeUser>; rows: Map<string, { row: any; seq: number }>; seq: number; calls: string[] }

const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };

/** A stand-in for the real sign-in + sync server with the same rules: roles, sellers only see their own book, only super admins manage logins. */
export async function mockCloud(page: Page): Promise<Cloud> {
  const cloud: Cloud = {
    users: {
      raj: { password: 'raj-password', name: 'Raj Bhanderi', role: 'super', personId: 'rc-bhanderi-raj' },
      dev: { password: 'dev-password', name: 'Dev Trivedi', role: 'super', personId: 'rc-dev-kinner-trivedi' },
      divya: { password: 'divya-password', name: 'Divya Achariya', role: 'seller', personId: 'rc-divya-achariya' },
      helper: { password: 'helper-password', name: 'Helper', role: 'admin' },
    },
    rows: new Map(), seq: 0, calls: [],
  };
  const loginOf = (email: string) => email.split('@')[0];
  const ids = (personId: string) => [personId, ...[...cloud.rows.values()].filter((x) => x.row.t === 'receivers' && x.row.data.agentOf === personId).map((x) => x.row.id)];

  await page.route('https://cndndjgknjulrfutixvx.supabase.co/**', async (route) => {
    const req = route.request(); const url = req.url();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: H });
    if (url.includes('/auth/v1/token')) {
      const b = req.postDataJSON() as any;
      if (url.includes('grant_type=refresh_token')) return route.fulfill({ status: 200, headers: H, json: { access_token: 'tok-' + b.refresh_token.slice(4), refresh_token: b.refresh_token, expires_in: 3600 } });
      const login = loginOf(b.email); const u = cloud.users[login];
      if (!u || u.password !== b.password) return route.fulfill({ status: 400, headers: H, json: { error: 'invalid_grant' } });
      return route.fulfill({ status: 200, headers: H, json: { access_token: 'tok-' + login, refresh_token: 'ref-' + login, expires_in: 3600 } });
    }
    if (!url.includes('/functions/v1/sync')) return route.fulfill({ status: 404, headers: H, json: {} });
    const login = (req.headers()['authorization'] ?? '').replace('Bearer tok-', ''); const me = cloud.users[login];
    if (!me) return route.fulfill({ status: 401, headers: H, json: { error: 'Sign in again' } });
    if (me.disabled) return route.fulfill({ status: 403, headers: H, json: { error: 'This login is switched off.' } });
    const b = req.postDataJSON() as any; const action = b.action ?? 'sync'; cloud.calls.push(`${login}:${action}`);
    const pub = (l: string, u: FakeUser) => ({ login: l, name: u.name, role: u.role, personId: u.personId ?? null, googleEmail: u.googleEmail ?? null, disabled: !!u.disabled, passwordLogin: true });
    if (action === 'me') return route.fulfill({ status: 200, headers: H, json: { user: pub(login, me) } });
    if (action === 'users.list' || action === 'users.create' || action === 'users.update') {
      if (me.role !== 'super') return route.fulfill({ status: 403, headers: H, json: { error: 'Only a super admin can do that' } });
      if (action === 'users.create') {
        if (cloud.users[b.login]) return route.fulfill({ status: 409, headers: H, json: { error: 'That login id is taken' } });
        cloud.users[b.login] = { password: b.password, name: b.name, role: b.role, personId: b.personId, googleEmail: b.googleEmail };
      }
      if (action === 'users.update') Object.assign(cloud.users[b.login], b.disabled !== undefined ? { disabled: b.disabled } : {}, b.role ? { role: b.role } : {});
      return route.fulfill({ status: 200, headers: H, json: { users: Object.entries(cloud.users).map(([l, u]) => pub(l, u)), user: {} } });
    }
    // sync
    const seller = me.role === 'seller'; const mine = seller ? ids(me.personId!) : [];
    const saleOwner = (id: string) => cloud.rows.get('sales|' + id)?.row.data.sellerId;
    for (const r of b.push as any[]) {
      if (seller) {
        const okSale = r.t === 'sales' && mine.includes(r.data.sellerId) && (!cloud.rows.has('sales|' + r.id) || mine.includes(saleOwner(r.id)));
        const okPay = r.t === 'payments' && (mine.includes(saleOwner(r.data.saleId)) || (b.push as any[]).some((x) => x.t === 'sales' && x.id === r.data.saleId && mine.includes(x.data.sellerId)));
        if (!(r.t === 'customers' || okSale || okPay)) continue;
      }
      const k = r.t + '|' + r.id; const c = cloud.rows.get(k);
      if (!c || c.row.updatedAt < r.updatedAt) cloud.rows.set(k, { row: r, seq: ++cloud.seq });
    }
    const visible = (x: { row: any; seq: number }) => {
      if (!seller) return true;
      const r = x.row;
      if (['events', 'passTypes', 'receivers'].includes(r.t)) return true;
      if (r.t === 'sales') return mine.includes(r.data.sellerId);
      if (r.t === 'payments') return mine.includes(saleOwner(r.data.saleId));
      if (r.t === 'customers') return [...cloud.rows.values()].some((s) => s.row.t === 'sales' && s.row.data.customerId === r.id && mine.includes(s.row.data.sellerId));
      return false;
    };
    const list = [...cloud.rows.values()].filter((x) => x.seq > b.since && visible(x)).sort((a, c) => a.seq - c.seq);
    return route.fulfill({ status: 200, headers: H, json: { rows: list.map((x) => x.row), cursor: list.length ? list[list.length - 1].seq : b.since, more: false } });
  });
  return cloud;
}

export async function signInAs(page: Page, login: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Login id').fill(login);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
