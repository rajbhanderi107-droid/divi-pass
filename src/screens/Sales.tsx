import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSalesView, type SaleView } from '../db/queries';
import { Card, Chip, Empty, Pill, inputCls } from '../components/ui';
import { formatINR } from '../domain/money';
import { formatDateLabel, istDate } from '../domain/time';
import { formatPhone } from '../domain/phone';

export const statusTone = (s: SaleView['status']) => (s === 'paid' ? 'green' : s === 'partial' || s === 'unpaid' ? 'amber' : s === 'cancelled' ? 'gray' : 'red') as 'green' | 'amber' | 'red' | 'gray';
export const statusLabel: Record<SaleView['status'], string> = { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', overpaid: 'Overpaid', refundDue: 'Refund due', cancelled: 'Cancelled' };
export const linesText = (s: SaleView['sale']) => s.lines.map((l) => `${l.qty} ${l.nameSnap}`).join(' + ');

const FILTERS = [['tonight', 'Tonight'], ['unpaid', 'Unpaid'], ['unpunched', 'Unpunched'], ['all', 'All']] as const;

export function Sales() {
  const rows = useSalesView(); const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const f = sp.get('f') ?? 'all'; const night = sp.get('night');
  const today = istDate();

  const list = useMemo(() => {
    if (!rows) return [];
    const ql = q.trim().toLowerCase(); const qd = ql.replace(/\D/g, '');
    return rows.filter((r) => {
      if (night && r.sale.eventId !== night) return false;
      if (f === 'tonight' && r.event?.date !== today) return false;
      if (f === 'unpaid' && !(r.due > 0)) return false;
      if (f === 'unpunched' && (r.sale.cancelledAt || r.sale.punchState === 'done')) return false;
      if (!ql) return true;
      return (r.customer?.nameLower ?? '').includes(ql) || r.sale.refNo.toLowerCase().includes(ql) ||
        (qd.length >= 3 && (r.customer?.phone.includes(qd) || r.payments.some((p) => p.utr?.includes(qd))));
    });
  }, [rows, q, f, night, today]);

  if (!rows) return null;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Sales</h1>
      <input className={inputCls} type="search" placeholder="Search name, phone, DV-0001 or UTR" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map(([k, l]) => <Chip key={k} active={f === k} onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set('f', k); return n; })}>{l}</Chip>)}
        {night && <Chip active onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('night'); return n; })}>One night ✕</Chip>}
      </div>
      {list.length === 0 && <Empty text={rows.length === 0 ? 'No sales yet.' : f === 'unpaid' ? 'Nothing due 🎉' : f === 'unpunched' ? 'All punched 🎉' : 'No sales match.'}><Link to="/add" className="rounded-xl bg-lime px-5 py-3 font-bold text-black">Add sale</Link></Empty>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.sale.id}>
            <Link to={`/sale/${r.sale.id}`}>
              <Card className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.customer?.name || (r.customer ? formatPhone(r.customer.phone) : '—')}</div>
                  <div className="text-sm text-zinc-400">{linesText(r.sale)} · {r.event ? formatDateLabel(r.event.date) : ''}</div>
                  <div className="text-xs text-zinc-500">{r.sale.refNo}{r.sale.punchState !== 'done' && !r.sale.cancelledAt ? ' · ● not punched' : ''}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold">{formatINR(r.sale.total)}</div>
                  <Pill tone={statusTone(r.status)}>{statusLabel[r.status]}{r.status === 'partial' ? ` · ${formatINR(r.due)} due` : ''}</Pill>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
