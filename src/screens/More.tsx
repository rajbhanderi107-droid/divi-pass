import { useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { addEvent, addReceiver, deleteEvent, restoreSale, savePassType, ValidationError } from '../db/repo';
import { applyImport, buildBackup, markBackedUp, parseBackup, previewImport, type BackupFile, type ImportPreview } from '../db/backup';
import { useEvents, usePassTypes, useReceivers, useSetting } from '../db/queries';
import { Btn, Card, Chip, Empty, Field, inputCls, useToast } from '../components/ui';
import { setSetting } from '../db/repo';
import { testReader } from '../lib/photo';
import { formatINR, parseRupees } from '../domain/money';
import { formatDateLabel, formatDateTime } from '../domain/time';
import { computePunchState, computeSeats, computeTotal } from '../domain/status';

const Back = () => <Link to="/more" className="text-zinc-400">← More</Link>;

export function More() {
  return (
    <Routes>
      <Route index element={<Menu />} />
      <Route path="backup" element={<Backup />} />
      <Route path="trash" element={<Trash />} />
      <Route path="nights" element={<Nights />} />
      <Route path="passes" element={<Passes />} />
      <Route path="receivers" element={<Receivers />} />
      <Route path="photo" element={<PhotoSetup />} />
      <Route path="health" element={<Health />} />
    </Routes>
  );
}

function Menu() {
  const items = [['backup', 'Backup & restore'], ['nights', 'Nights'], ['passes', 'Pass types & prices'], ['photo', 'Photo reader (add from photo)'], ['receivers', 'Who receives money'], ['trash', 'Trash'], ['health', 'Health check']];
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">More</h1>
      {items.map(([to, l]) => <Link key={to} to={to}><Card className="mb-2 flex justify-between"><span>{l}</span><span className="text-zinc-500">›</span></Card></Link>)}
    </div>
  );
}

function Backup() {
  const toast = useToast(); const last = useSetting<number | null>('lastBackupAt', null); const since = useSetting<number>('salesSinceBackup', 0);
  const [file, setFile] = useState<BackupFile>(); const [prev, setPrev] = useState<ImportPreview>(); const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function exportNow() {
    const b = await buildBackup(); const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    const name = `divi-pass-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    const f = new File([JSON.stringify(b)], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: 'Divi Pass backup' }); await markBackedUp(); toast('Backup shared'); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = name; a.click(); URL.revokeObjectURL(a.href);
    await markBackedUp(); toast('Backup downloaded');
  }
  async function pick(f: File | undefined) {
    setErr(''); setFile(undefined); setPrev(undefined);
    if (!f) return;
    try { const b = parseBackup(await f.text()); setFile(b); setPrev(await previewImport(b)); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="space-y-4">
      <Back /><h1 className="text-2xl font-bold">Backup & restore</h1>
      <Card><div>Last backup: <b>{last ? formatDateTime(last) : 'never'}</b></div><div className="text-sm text-zinc-400">{since} new sales since then</div></Card>
      <Btn className="w-full" onClick={exportNow}>Back up now (share / download)</Btn>
      <p className="text-sm text-zinc-400">Send the file to yourself on WhatsApp or save it to Google Drive / Files.</p>
      <h2 className="pt-4 font-semibold text-zinc-300">Restore</h2>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <Btn kind="ghost" className="w-full" onClick={() => input.current?.click()}>Choose backup file</Btn>
      {err && <p role="alert" className="text-red-300">{err}</p>}
      {prev && file && (
        <Card className="space-y-2">
          <div>Exported {formatDateTime(file.exportedAt)}</div>
          <div><b>{prev.added}</b> new · <b>{prev.updated}</b> updated · {prev.unchanged} same · {prev.older} older than yours (kept yours)</div>
          <Btn className="w-full" onClick={async () => { await applyImport(file); setFile(undefined); setPrev(undefined); toast('Restored'); }}>Merge into this phone</Btn>
        </Card>
      )}
    </div>
  );
}

function Trash() {
  const rows = useLiveQuery(async () => {
    const s = (await db.sales.toArray()).filter((x) => x.deletedAt); const c = await db.customers.toArray();
    return s.map((x) => ({ s: x, c: c.find((y) => y.id === x.customerId) }));
  }, []);
  if (!rows) return null;
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Trash</h1>
      <p className="text-sm text-zinc-400">Deleted sales stay here for 30 days.</p>
      {rows.length === 0 && <Empty text="Trash is empty." />}
      {rows.map(({ s, c }) => (
        <Card key={s.id} className="flex items-center justify-between"><div><b>{c?.name || c?.phone}</b><div className="text-sm text-zinc-400">{s.refNo} · {formatINR(s.total)}</div></div><Btn kind="ghost" onClick={() => restoreSale(s.id)}>Restore</Btn></Card>
      ))}
    </div>
  );
}

function Nights() {
  const events = useEvents(); const [d, setD] = useState(''); const [err, setErr] = useState('');
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Nights</h1>
      {events?.map((e) => <Card key={e.id} className="flex items-center justify-between"><span>{formatDateLabel(e.date)} · {e.date}</span><button className="text-red-400" onClick={() => deleteEvent(e.id).catch((x) => setErr(x.message))}>Delete</button></Card>)}
      <Field label="Add night"><input type="date" className={inputCls} value={d} onChange={(e) => setD(e.target.value)} /></Field>
      {err && <p role="alert" className="text-red-300">{err}</p>}
      <Btn className="w-full" onClick={() => addEvent(d).then(() => { setD(''); setErr(''); }).catch((x) => setErr(x.message))}>Add night</Btn>
    </div>
  );
}

function Passes() {
  const pts = usePassTypes(); const [err, setErr] = useState('');
  const [n, setN] = useState({ name: '', kind: 'other' as 'solo' | 'couple' | 'other', seats: '1', list: '', price: '' });
  if (!pts) return null;
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Pass types & prices</h1>
      <p className="text-sm text-zinc-400">Set the price you actually charge. It can be different from the Showmates list price. Changing it only affects new sales. You can also change the price for a single sale on the Add screen.</p>
      {pts.map((p) => <PassRow key={p.id} p={p} onErr={setErr} />)}
      <Card className="space-y-2"><h2 className="font-semibold">Add pass type</h2>
        <input className={inputCls} placeholder="Name (e.g. Early Bird Solo)" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
        <div className="flex gap-2">{(['solo', 'couple', 'other'] as const).map((k) => <Chip key={k} active={n.kind === k} onClick={() => setN({ ...n, kind: k, seats: k === 'couple' ? '2' : '1' })}>{k}</Chip>)}</div>
        <div className="grid grid-cols-3 gap-2">
          <input className={inputCls} inputMode="numeric" placeholder="Seats" value={n.seats} onChange={(e) => setN({ ...n, seats: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="List ₹" value={n.list} onChange={(e) => setN({ ...n, list: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="Your ₹" value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} />
        </div>
        <Btn className="w-full" onClick={() => savePassType({ name: n.name, kind: n.kind, seatsPerUnit: Number(n.seats), listPrice: parseRupees(n.list) ?? NaN, price: parseRupees(n.price) ?? NaN, active: true }).then(() => { setN({ ...n, name: '', list: '', price: '' }); setErr(''); }).catch((e) => setErr(e instanceof ValidationError ? e.message : 'Could not save'))}>Add</Btn>
      </Card>
      {err && <p role="alert" className="text-red-300">{err}</p>}
    </div>
  );
}
function PassRow({ p, onErr }: { p: import('../domain/types').PassType; onErr: (s: string) => void }) {
  const [name, setName] = useState(p.name); const [seats, setSeats] = useState(String(p.seatsPerUnit));
  const [list, setList] = useState(String(p.listPrice)); const [price, setPrice] = useState(String(p.price));
  const save = (patch: { active?: boolean } = {}) => savePassType({ id: p.id, name, kind: p.kind, seatsPerUnit: Number(seats), listPrice: parseRupees(list) ?? NaN, price: parseRupees(price) ?? NaN, active: patch.active ?? p.active }).then(() => onErr('')).catch((e) => onErr(e instanceof ValidationError ? e.message : 'Could not save'));
  return (
    <Card className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2"><Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save()} /></Field></div>
        <Field label="Seats"><input className={inputCls} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} onBlur={() => save()} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Showmates list ₹"><input className={inputCls} inputMode="numeric" value={list} onChange={(e) => setList(e.target.value)} onBlur={() => save()} /></Field>
        <Field label="Your price ₹"><input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => save()} /></Field>
      </div>
      <Chip active={p.active} onClick={() => save({ active: !p.active })}>{p.active ? 'Shown when adding' : 'Hidden'}</Chip>
    </Card>
  );
}

function Receivers() {
  const rs = useReceivers(); const [n, setN] = useState('');
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Who receives money</h1>
      {rs?.map((r) => <Card key={r.id}>{r.name}</Card>)}
      <input className={inputCls} placeholder="Name (as on UPI)" value={n} onChange={(e) => setN(e.target.value)} />
      <Btn className="w-full" onClick={() => addReceiver(n).then(() => setN('')).catch(() => {})}>Add</Btn>
    </div>
  );
}

function Health() {
  const persisted = useSetting<boolean | null>('storagePersisted', null);
  const info = useLiveQuery(async () => {
    const [sales, payments, customers] = await Promise.all([db.sales.toArray(), db.payments.toArray(), db.customers.count()]);
    const bad: string[] = [];
    for (const s of sales) {
      if (s.total !== computeTotal(s.lines, s.discount)) bad.push(`${s.refNo}: total mismatch`);
      if (s.seats !== computeSeats(s.lines)) bad.push(`${s.refNo}: seats mismatch`);
      if (s.punchState !== computePunchState(s.lines)) bad.push(`${s.refNo}: punch state mismatch`);
    }
    const ids = new Set(sales.map((s) => s.id));
    for (const p of payments) if (!ids.has(p.saleId)) bad.push(`Payment ${p.id.slice(-6)} has no sale`);
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    return { sales: sales.filter((s) => !s.deletedAt).length, payments: payments.filter((p) => !p.deletedAt).length, customers, bad, used: est?.usage };
  }, []);
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Health check</h1>
      <Card className="space-y-1">
        <div>Storage kept by phone: <b>{persisted === null ? 'unknown' : persisted ? 'yes ✓' : 'no — install to home screen'}</b></div>
        <div>Sales {info?.sales} · Payments {info?.payments} · Customers {info?.customers}</div>
        {info?.used !== undefined && <div>Space used: {(info.used / 1024).toFixed(0)} KB</div>}
        <div>Version 1.0.0</div>
      </Card>
      <Card className={info?.bad.length ? 'border-red-500/50' : ''}>{info?.bad.length ? info.bad.map((b) => <div key={b} className="text-red-300">{b}</div>) : <span className="text-lime">All records consistent ✓</span>}</Card>
    </div>
  );
}

function PhotoSetup() {
  const toast = useToast();
  const url0 = useSetting<string>('photoReaderUrl', ''); const tok0 = useSetting<string>('photoReaderToken', '');
  const auto = useSetting<boolean>('autoSavePhotos', true);
  const [url, setUrl] = useState<string>(); const [token, setToken] = useState<string>(); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const u = url ?? url0; const t = token ?? tok0;
  async function save() {
    await setSetting('photoReaderUrl', u.trim()); await setSetting('photoReaderToken', t.trim()); toast('Saved');
  }
  async function test() {
    setBusy(true); setMsg('');
    try {
      const r = await testReader({ url: u.trim(), token: t.trim() });
      setMsg(r === 'ok' ? 'Connected ✓ — the reader accepted your access code.' : 'Reached the reader, but the access code is wrong.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Photo reader</h1>
      <p className="text-sm text-zinc-400">Lets you tap <b>Add from photo</b> on the Add screen and pick a WhatsApp or payment screenshot. A small server reads it with Claude and the app fills the form. You still check it and tap Save. Setup steps are in <code>server/README.md</code> in the repo.</p>
      <Field label="Reader link"><input className={inputCls} inputMode="url" autoCapitalize="none" placeholder="https://divi-pass-photo-reader.….workers.dev" value={u} onChange={(e) => setUrl(e.target.value)} /></Field>
      <Field label="Access code"><input className={inputCls} type="password" autoCapitalize="none" value={t} onChange={(e) => setToken(e.target.value)} /></Field>
      <Card className="flex items-center justify-between gap-3">
        <div><div className="font-semibold">Save automatically</div><div className="text-sm text-zinc-400">When a photo is clear (phone, passes and night all read), add the sale right away. Anything unclear opens the form for you to check.</div></div>
        <input type="checkbox" aria-label="Save automatically" className="h-7 w-7 shrink-0 accent-lime" checked={auto} onChange={(e) => setSetting('autoSavePhotos', e.target.checked)} />
      </Card>
      {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
      <div className="grid grid-cols-2 gap-2"><Btn kind="ghost" disabled={busy || !u || !t} onClick={test}>Test connection</Btn><Btn onClick={save}>Save</Btn></div>
      <p className="text-xs text-zinc-500">Photos are sent only to your own reader and Claude, and are not stored. The access code stays on this phone and is never included in backups.</p>
    </div>
  );
}
