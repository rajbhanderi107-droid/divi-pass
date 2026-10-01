import { BookBar } from '../components/BookBar';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useEvents, useReceivers, useSalesView } from '../db/queries';
import { Btn, Card, Chip, copyText, useToast } from '../components/ui';
import { formatINR } from '../domain/money';
import { formatDateLabel, formatDateTime, istDate } from '../domain/time';
import { formatPhone } from '../domain/phone';
import { netPaid } from '../domain/status';
import { nightStats, summaryText } from '../domain/report';
import { toCsv } from '../domain/csv';
import { downloadText } from '../lib/download';

export function Reports() {
  const events = useEvents(); const views = useSalesView(); const receivers = useReceivers(); const toast = useToast();
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const [sel, setSel] = useState<string>('');
  if (!events || !views || !receivers || !expenses) return null;
  const vs = views; const rcv = receivers; const today = istDate();
  const cur = events.find((e) => e.id === sel) ?? events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[0];
  const stats = events.map((e) => nightStats(e, views, expenses)); const st = cur ? stats.find((s) => s.eventId === cur.id) : undefined;
  const total = stats.reduce((a, s) => ({ sales: a.sales + s.sales, seats: a.seats + s.seats, revenue: a.revenue + s.revenue, collected: a.collected + s.collected, due: a.due + s.due, expenses: a.expenses + s.expenses }), { sales: 0, seats: 0, revenue: 0, collected: 0, due: 0, expenses: 0 });
  const rname = (id: string) => (id ? receivers.find((r) => r.id === id)?.name ?? 'Unknown' : 'No receiver set');

  function salesCsv() {
    const rows: (string | number | undefined)[][] = [['Ref', 'Sold at', 'Night', 'Name', 'Phone', 'Passes', 'Seats', 'Discount', 'Total', 'Paid', 'Due', 'Status', 'Punched', 'Channel', 'Sold by', 'Notes']];
    for (const v of [...vs].sort((a, b) => a.sale.createdAt - b.sale.createdAt)) {
      rows.push([v.sale.refNo, formatDateTime(v.sale.createdAt), v.event?.date, v.customer?.name, v.customer?.phone, v.sale.lines.map((l) => `${l.qty} ${l.nameSnap} @${l.unitPriceSnap}`).join(' + '), v.sale.seats, v.sale.discount, v.sale.total, netPaid(v.payments), v.due, v.status, v.sale.punchState, v.sale.channel, rcv.find((r) => r.id === v.sale.sellerId)?.name, v.sale.notes]);
    }
    downloadText(`divi-pass-sales-${istDate()}.csv`, toCsv(rows));
  }
  function paymentsCsv() {
    const rows: (string | number | undefined)[][] = [['Ref', 'Name', 'Phone', 'Type', 'Amount', 'Method', 'UTR', 'Received by', 'Paid at']];
    for (const v of vs) for (const p of v.payments) rows.push([v.sale.refNo, v.customer?.name, v.customer?.phone, p.kind, p.amount, p.method, p.utr, rcv.find((r) => r.id === p.receiverId)?.name, formatDateTime(p.paidAt)]);
    downloadText(`divi-pass-payments-${istDate()}.csv`, toCsv(rows));
  }

  return (
    <div className="space-y-4 print-area">
      <Link to="/more" className="no-print text-zinc-400">← More</Link>
      <h1 className="text-2xl font-bold">Reports</h1>
      <BookBar />
      <div className="no-print flex gap-2 overflow-x-auto">{events.map((e) => <Chip key={e.id} active={e.id === cur?.id} onClick={() => setSel(e.id)}>{formatDateLabel(e.date)}</Chip>)}</div>
      {cur && st && (
        <>
          <h2 className="font-semibold">{formatDateLabel(cur.date)}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Card><div className="text-xs text-zinc-400">Sales · seats</div><b>{st.sales} · {st.seats}</b></Card>
            <Card><div className="text-xs text-zinc-400">Sold value</div><b>{formatINR(st.revenue)}</b></Card>
            <Card><div className="text-xs text-zinc-400">Collected</div><b className="text-sand">{formatINR(st.collected)}</b></Card>
            <Card><div className="text-xs text-zinc-400">Due</div><b className="text-amber-300">{formatINR(st.due)}</b></Card>
            <Card><div className="text-xs text-zinc-400">Expenses</div><b>{formatINR(st.expenses)}</b></Card>
            <Card><div className="text-xs text-zinc-400">Net (collected − expenses)</div><b>{formatINR(st.net)}</b></Card>
          </div>
          <Card className="space-y-1"><div className="text-sm font-semibold text-zinc-300">Received by</div>
            {Object.entries(st.byReceiver).map(([k, v]) => <div key={k} className="flex justify-between"><span>{rname(k)}</span><b>{formatINR(v)}</b></div>)}
            {Object.keys(st.byReceiver).length === 0 && <div className="text-zinc-500">No payments yet.</div>}
          </Card>
          <Btn className="no-print w-full" onClick={async () => toast((await copyText(summaryText(st))) ? 'Summary copied — paste in WhatsApp' : 'Copy failed')}>Copy WhatsApp summary</Btn>
        </>
      )}
      <h2 className="font-semibold">All nights</h2>
      <Card className="space-y-1 text-sm">
        {stats.filter((s) => s.sales || s.expenses).map((s) => <div key={s.eventId} className="flex justify-between"><span>{formatDateLabel(s.date)}</span><span>{s.sales} sales · {s.seats} seats · {formatINR(s.collected)}</span></div>)}
        <div className="flex justify-between border-t border-line pt-1 font-bold"><span>Season</span><span>{total.sales} sales · {total.seats} seats · {formatINR(total.collected)}</span></div>
        <div className="flex justify-between text-amber-300"><span>Still due</span><span>{formatINR(total.due)}</span></div>
      </Card>
      {cur && (
        <>
          <h2 className="font-semibold">Buyers on {formatDateLabel(cur.date)}</h2>
          <table className="w-full text-sm"><tbody>
            {views.filter((v) => v.sale.eventId === cur.id && !v.sale.cancelledAt).map((v) => <tr key={v.sale.id} className="border-b border-line"><td className="py-1">{v.customer?.name || (v.customer && formatPhone(v.customer.phone))}</td><td>{v.sale.lines.map((l) => `${l.qty} ${l.nameSnap}`).join(' + ')}</td><td className="text-right">{formatINR(v.sale.total)}</td></tr>)}
          </tbody></table>
        </>
      )}
      <div className="no-print grid grid-cols-2 gap-2">
        <Btn kind="ghost" onClick={salesCsv}>Sales CSV</Btn><Btn kind="ghost" onClick={paymentsCsv}>Payments CSV</Btn>
        <Btn kind="ghost" className="col-span-2" onClick={() => window.print()}>Print / Save as PDF</Btn>
      </div>
    </div>
  );
}
