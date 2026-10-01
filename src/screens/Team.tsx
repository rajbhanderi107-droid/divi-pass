import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, AuthError, signOut, useAuth, type Role } from '../auth';
import { useReceivers } from '../db/queries';
import { syncNow, useSyncStatus } from '../sync';
import { Btn, Card, Chip, Field, Pill, inputCls, useToast } from '../components/ui';
import { formatDateTime } from '../domain/time';

interface TeamUser { login: string; name: string; role: Role; personId: string | null; googleEmail: string | null; disabled: boolean; passwordLogin: boolean }
export const ROLE_LABEL: Record<Role, string> = { super: 'Super admin', admin: 'Admin', seller: 'Seller' };
const ROLE_HELP: Record<Role, string> = {
  super: 'Sees all data of every seller, plus creating logins and passwords. Only super admins see everything.',
  admin: 'Sees only their own book, but can also set up nights, prices and people, and use reports and backups. Cannot create logins.',
  seller: 'Only their own book: adds sales and payments and sees them. Cannot change prices or nights.',
};
const back = <Link to="/more" className="text-zinc-400">← More</Link>;
const msg = (e: unknown) => (e instanceof AuthError && e.kind === 'offline' ? 'No internet.' : e instanceof Error ? e.message : 'Something went wrong');

export function Account() {
  const a = useAuth(); const st = useSyncStatus(); const toast = useToast();
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [sure, setSure] = useState(false);
  if (a.status !== 'in') return null;
  const p = a.profile;
  const label: Record<string, string> = { off: 'Waiting…', idle: 'Waiting…', syncing: 'Syncing…', ok: 'Up to date', offline: 'No internet — will catch up by itself', auth: 'Signed out', error: st.error ?? 'Problem syncing' };
  return (
    <div className="space-y-3">{back}<h1 className="text-2xl font-bold">Account</h1>
      <Card className="space-y-1"><div className="text-lg font-extrabold">{p.name}</div><div className="text-sm text-zinc-400">Login: {p.login}</div><div><Pill tone="green">{ROLE_LABEL[p.role]}</Pill></div></Card>
      <Card tone={st.state === 'ok' ? 'sage' : undefined} className="space-y-1">
        <div className="font-extrabold">☁ {label[st.state]}</div>
        {st.lastOk && <div className="text-sm opacity-90">Last synced {formatDateTime(st.lastOk)} · sent {st.pushed ?? 0} · received {st.pulled ?? 0}</div>}
      </Card>
      <Btn kind="ghost" className="w-full" onClick={() => syncNow()}>Sync now</Btn>
      {p.passwordLogin !== false && (
        <div className="space-y-2">
          <Field label="New password (8+ characters)"><input className={inputCls} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
          <Btn className="w-full" disabled={pw.length < 8} onClick={async () => { setErr(''); try { await api('password.change', { password: pw }); setPw(''); toast('Password changed'); } catch (e) { setErr(msg(e)); } }}>Change password</Btn>
        </div>
      )}
      <Btn kind="danger" className="w-full" onClick={async () => {
        if (!sure) { setSure(true); return; }
        try { await syncNow(); } catch { /* offline: the confirm below already warned */ }
        await signOut();
      }}>{sure ? 'Tap again — sends unsynced changes, then signs out and clears this phone' : 'Sign out'}</Btn>
    </div>
  );
}

export function Team() {
  const a = useAuth(); const people = useReceivers(); const toast = useToast();
  const [users, setUsers] = useState<TeamUser[]>(); const [err, setErr] = useState('');
  const [f, setF] = useState({ login: '', name: '', password: '', googleEmail: '', role: 'seller' as Role, personId: '' });
  const [reset, setReset] = useState<Record<string, string>>({});
  const load = () => api<{ users: TeamUser[] }>('users.list').then((r) => setUsers(r.users)).catch((e) => setErr(msg(e)));
  useEffect(() => { void load(); }, []);
  if (a.status !== 'in' || a.profile.role !== 'super') return <div className="space-y-3">{back}<p className="text-zinc-400">Only a super admin can manage logins.</p></div>;
  const pname = (id: string | null) => people?.find((x) => x.id === id)?.name;
  async function update(login: string, patch: Record<string, unknown>, ok: string) {
    setErr(''); try { await api('users.update', { login, ...patch }); toast(ok); await load(); } catch (e) { setErr(msg(e)); }
  }
  async function create() {
    setErr('');
    try {
      await api('users.create', { ...f, personId: f.personId || undefined, password: f.password || undefined, googleEmail: f.googleEmail || undefined });
      setF({ login: '', name: '', password: '', googleEmail: '', role: 'seller', personId: '' }); toast('Login created'); await load();
    } catch (e) { setErr(msg(e)); }
  }
  return (
    <div className="space-y-4">{back}<h1 className="text-2xl font-bold">Team &amp; logins</h1>
      <p className="text-sm text-zinc-400">Only super admins can create logins. Give someone a login id and password, a Google email, or both.</p>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      {users?.map((u) => (
        <Card key={u.login} className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div><div className="font-semibold">{u.name}</div><div className="text-xs text-zinc-400">{u.login}{u.googleEmail ? ` · ${u.googleEmail}` : ''}{u.personId ? ` · sells as ${pname(u.personId) ?? '…'}` : ''}</div></div>
            <div className="flex gap-1"><Pill tone={u.role === 'super' ? 'green' : u.role === 'admin' ? 'amber' : 'gray'}>{ROLE_LABEL[u.role]}</Pill>{u.disabled && <Pill tone="red">Off</Pill>}</div>
          </div>
          {u.login !== (a.profile.login) && (
            <div className="flex flex-wrap gap-2">
              {(['super', 'admin', 'seller'] as Role[]).map((r) => <Chip key={r} active={u.role === r} onClick={() => u.role !== r && update(u.login, { role: r }, `${u.name} is now ${ROLE_LABEL[r]}`)}>{ROLE_LABEL[r]}</Chip>)}
              <Chip onClick={() => update(u.login, { disabled: !u.disabled }, u.disabled ? 'Login switched on' : 'Login switched off')}>{u.disabled ? 'Switch on' : 'Switch off'}</Chip>
            </div>
          )}
          {u.passwordLogin && (
            <div className="flex gap-2">
              <input aria-label={`New password for ${u.name}`} className={`${inputCls} !min-h-10`} type="text" autoComplete="off" placeholder="New password" value={reset[u.login] ?? ''} onChange={(e) => setReset({ ...reset, [u.login]: e.target.value })} />
              <Btn kind="ghost" disabled={(reset[u.login] ?? '').length < 8} onClick={async () => { await update(u.login, { password: reset[u.login] }, 'Password reset'); setReset({ ...reset, [u.login]: '' }); }}>Reset</Btn>
            </div>
          )}
        </Card>
      ))}
      <h2 className="pt-2 font-semibold text-zinc-300">Create a login</h2>
      <Card className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Login id"><input className={inputCls} autoCapitalize="none" autoComplete="off" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase() })} /></Field>
        <Field label="Password (8+ characters)"><input className={inputCls} type="text" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Google email (optional)"><input className={inputCls} type="email" autoCapitalize="none" autoComplete="off" value={f.googleEmail} onChange={(e) => setF({ ...f, googleEmail: e.target.value })} /></Field>
        <Field group label="Role">
          <div className="flex flex-wrap gap-2">{(['super', 'admin', 'seller'] as Role[]).map((r) => <Chip key={r} active={f.role === r} onClick={() => setF({ ...f, role: r })}>{ROLE_LABEL[r]}</Chip>)}</div>
          <p className="mt-1 text-xs text-zinc-500">{ROLE_HELP[f.role]}</p>
        </Field>
        {f.role !== 'super' && (
          <Field group label="Sells as">
            <div className="flex flex-wrap gap-2">{people?.map((x) => <Chip key={x.id} active={f.personId === x.id} onClick={() => setF({ ...f, personId: x.id })}>{x.name}</Chip>)}</div>
          </Field>
        )}
        <Btn className="w-full" disabled={!f.login || !f.name || (!f.password && !f.googleEmail) || (f.role !== 'super' && !f.personId)} onClick={create}>Create login</Btn>
      </Card>
    </div>
  );
}
