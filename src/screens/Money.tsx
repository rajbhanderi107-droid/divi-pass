import { useAuth } from '../auth';
import { BookBar } from '../components/BookBar';
import { useState } from 'react';
import { useWindow } from '../components/Windowed';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { addExpense, deleteExpense, restoreExpense, ValidationError } from '../db/repo';
import { useEvents, useReceivers, useSalesView } from '../db/queries';
import { Btn, Card, Chip, Empty, Field, inputCls, useToast } from '../components/ui';
import { formatINR, parseRupees } from '../domain/money';
import { formatDateLabel, istDate } from '../domain/time';
import { formatPhone } from '../domain/phone';
import { linesText } from './Sales';

export function Money() {
  const auth = useAuth(); const isSeller = auth.status === 'in' && auth.profile.role !== 'super';
  const rows = useSalesView(); const receivers = useReceivers(); const events = useEvents(); const toast = useToast();
  const expenses = useLiveQuery(async () => (await db.expenses.orderBy('paidAt').reverse().toArray()).filter((e) => !e.deletedAt), []);
  const [ev, setEv] = useState(''); const [label, setLabel] = useState(''); const [amt, setAmt] = useState(''); const [err, setErr] = useState('');
  const duesAll = (rows ?? []).filter((r) => r.due > 0);
  const { count: dueCount, more: dueMore } = useWindow(duesAll.length, duesAll.length);
  if (!rows || !receivers || !events || !expenses) return null;
  const today = istDate(); const curEv = events.find((e) => e.id === ev) ?? events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[0];
  const dues = rows.filter((r) => r.due > 0).sort((a, b) => (a.event?.date ?? '').localeCompare(b.event?.date ?? '') || b.due - a.due);
  const byReceiver = new Map<string, number>(); let unassigned = 0;
  for (const r of rows) for (const p of r.payments) {
    const v = p.kind === 'receipt' ? p.amount : -p.amount;
    if (p.receiverId) byReceiver.set(p.receiverId, (byReceiver.get(p.receiverId) ?? 0) + v); else unassigned += v;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Money</h1>
      <BookBar />
      <h2 className="font-semibold text-zinc-300">Received by</h2>
      <Card className="space-y-2">
        {receivers.map((r) => <div key={r.id} className="flex justify-between"><span>{r.name}</span><b>{formatINR(byReceiver.get(r.id) ?? 0)}</b></div>)}
        {receivers.filter((r) => r.agentOf && (byReceiver.get(r.id) ?? 0) !== 0).map((r) => (
          <div key={'h' + r.id} className="flex justify-between text-sm text-sand"><span>{r.name} holds for {receivers.find((x) => x.id === r.agentOf)?.name ?? 'their principal'}</span><b>{formatINR(byReceiver.get(r.id) ?? 0)}</b></div>
        ))}
        {unassigned !== 0 && <div className="flex justify-between text-zinc-400"><span>No receiver set</span><b>{formatINR(unassigned)}</b></div>}
      </Card>
      <h2 className="font-semibold text-zinc-300">Dues · {formatINR(dues.reduce((a, r) => a + r.due, 0))}</h2>
      {dues.length === 0 && <Empty text="Nobody owes you anything 🎉" />}
      {dues.slice(0, dueCount).map((r) => (
        <Link key={r.sale.id} to={`/sale/${r.sale.id}`}>
          <Card className="mb-2 flex justify-between">
            <div><div className="font-semibold">{r.customer?.name || (r.customer && formatPhone(r.customer.phone))}</div><div className="text-sm text-zinc-400">{linesText(r.sale)}</div></div>
            <b className="text-amber-300">{formatINR(r.due)}</b>
          </Card>
        </Link>
      ))}
      {dueMore}
      {!isSeller && (<>
      <h2 className="pt-2 font-semibold text-zinc-300">Expenses · {formatINR(expenses.reduce((a, e) => a + e.amount, 0))}</h2>
      <Card className="space-y-2">
        <div className="flex gap-2 overflow-x-auto">{events.map((e) => <Chip key={e.id} active={e.id === curEv?.id} onClick={() => setEv(e.id)}>{formatDateLabel(e.date)}</Chip>)}</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="For"><input className={inputCls} placeholder="Sound, decoration…" value={label} onChange={(e) => setLabel(e.target.value)} /></Field></div>
          <Field label="₹"><input className={inputCls} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        </div>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <Btn className="w-full" onClick={async () => {
          const a = parseRupees(amt); if (a === null) { setErr('Amount must be whole rupees'); return; }
          try { await addExpense({ eventId: curEv!.id, label, amount: a }); setLabel(''); setAmt(''); setErr(''); } catch (e) { setErr(e instanceof ValidationError ? e.message : 'Could not save'); }
        }}>Add expense</Btn>
      </Card>
      {expenses.map((e) => (
        <Card key={e.id} className="flex items-center justify-between"><div><b>{e.label}</b><div className="text-xs text-zinc-400">{formatDateLabel(events.find((x) => x.id === e.eventId)?.date ?? '1970-01-01')}</div></div>
          <div className="flex items-center gap-3"><b>{formatINR(e.amount)}</b><button className="text-red-400" onClick={() => { deleteExpense(e.id); toast('Expense removed', { label: 'Undo', run: () => { restoreExpense(e.id); } }); }}>Remove</button></div></Card>
      ))}
      </>)}
    </div>
  );
}
