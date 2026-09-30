import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSalesView } from '../db/queries';
import { Card, Empty, Pill, inputCls } from '../components/ui';
import { formatINR } from '../domain/money';
import { formatPhone, phoneDigits } from '../domain/phone';
import { formatDateLabel } from '../domain/time';
import { netPaid } from '../domain/status';
import { linesText, statusLabel, statusTone } from './Sales';

const Back = ({ to = '/more' }: { to?: string }) => <Link to={to} className="text-zinc-400">← Back</Link>;

export function CustomerList() {
  const rows = useSalesView(); const [q, setQ] = useState('');
  const list = useMemo(() => {
    const m = new Map<string, { id: string; name: string; phone: string; sales: number; spent: number; due: number; last: number }>();
    for (const r of rows ?? []) {
      if (!r.customer) continue;
      const c = m.get(r.customer.id) ?? { id: r.customer.id, name: r.customer.name, phone: r.customer.phone, sales: 0, spent: 0, due: 0, last: 0 };
      if (!r.sale.cancelledAt) { c.sales++; c.spent += r.sale.total; c.due += r.due; }
      c.last = Math.max(c.last, r.sale.createdAt); m.set(r.customer.id, c);
    }
    const ql = q.trim().toLowerCase(); const qd = ql.replace(/\D/g, '');
    return [...m.values()].filter((c) => !ql || c.name.toLowerCase().includes(ql) || (qd.length >= 3 && c.phone.includes(qd))).sort((a, b) => b.last - a.last);
  }, [rows, q]);
  if (!rows) return null;
  return (
    <div className="space-y-3"><Back /><h1 className="text-2xl font-bold">Customers</h1>
      <input className={inputCls} type="search" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <Empty text="No customers yet." />}
      {list.map((c) => (
        <Link key={c.id} to={`/more/customers/${c.id}`}>
          <Card className="mb-2 flex items-center justify-between">
            <div><div className="font-semibold">{c.name || formatPhone(c.phone)}</div><div className="text-xs text-zinc-400">{formatPhone(c.phone)} · {c.sales} sale{c.sales === 1 ? '' : 's'}{c.sales > 1 ? ' · repeat buyer' : ''}</div></div>
            <div className="text-right"><div className="font-bold">{formatINR(c.spent)}</div>{c.due > 0 && <div className="text-xs text-amber-300">{formatINR(c.due)} due</div>}</div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function CustomerDetail() {
  const { id = '' } = useParams(); const rows = useSalesView();
  if (!rows) return null;
  const mine = rows.filter((r) => r.customer?.id === id); const c = mine[0]?.customer;
  if (!c) return <div className="space-y-3"><Back to="/more/customers" /><Empty text="Customer not found." /></div>;
  const spent = mine.filter((r) => !r.sale.cancelledAt).reduce((a, r) => a + r.sale.total, 0);
  const paid = mine.reduce((a, r) => a + netPaid(r.payments), 0); const due = mine.reduce((a, r) => a + r.due, 0);
  return (
    <div className="space-y-3"><Back to="/more/customers" />
      <h1 className="text-2xl font-bold">{c.name || formatPhone(c.phone)}</h1>
      <div className="flex gap-4 text-sm"><a className="text-sand" href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a><a className="text-sand" href={`https://wa.me/${phoneDigits(c.phone)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card><div className="text-xs text-zinc-400">Bought</div><b>{formatINR(spent)}</b></Card>
        <Card><div className="text-xs text-zinc-400">Paid</div><b className="text-sand">{formatINR(paid)}</b></Card>
        <Card><div className="text-xs text-zinc-400">Due</div><b className="text-amber-300">{formatINR(due)}</b></Card>
      </div>
      {mine.map((r) => (
        <Link key={r.sale.id} to={`/sale/${r.sale.id}`}>
          <Card className="mb-2 flex items-center justify-between"><div><div className="font-semibold">{linesText(r.sale)}</div><div className="text-xs text-zinc-400">{r.sale.refNo} · {r.event ? formatDateLabel(r.event.date) : ''}</div></div>
            <div className="text-right"><div className="font-bold">{formatINR(r.sale.total)}</div><Pill tone={statusTone(r.status)}>{statusLabel[r.status]}</Pill></div></Card>
        </Link>
      ))}
    </div>
  );
}
