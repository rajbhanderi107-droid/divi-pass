import { Link } from 'react-router-dom';
import { useReceivers, useSalesView } from '../db/queries';
import { Card, Empty } from '../components/ui';
import { formatINR } from '../domain/money';
import { formatPhone } from '../domain/phone';
import { linesText } from './Sales';

export function Money() {
  const rows = useSalesView(); const receivers = useReceivers();
  if (!rows || !receivers) return null;
  const dues = rows.filter((r) => r.due > 0).sort((a, b) => (a.event?.date ?? '').localeCompare(b.event?.date ?? '') || b.due - a.due);
  const byReceiver = new Map<string, number>(); let unassigned = 0;
  for (const r of rows) for (const p of r.payments) {
    const v = p.kind === 'receipt' ? p.amount : -p.amount;
    if (p.receiverId) byReceiver.set(p.receiverId, (byReceiver.get(p.receiverId) ?? 0) + v); else unassigned += v;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Money</h1>
      <h2 className="font-semibold text-zinc-300">Received by</h2>
      <Card className="space-y-2">
        {receivers.map((r) => <div key={r.id} className="flex justify-between"><span>{r.name}</span><b>{formatINR(byReceiver.get(r.id) ?? 0)}</b></div>)}
        {unassigned !== 0 && <div className="flex justify-between text-zinc-400"><span>No receiver set</span><b>{formatINR(unassigned)}</b></div>}
      </Card>
      <h2 className="font-semibold text-zinc-300">Dues · {formatINR(dues.reduce((a, r) => a + r.due, 0))}</h2>
      {dues.length === 0 && <Empty text="Nobody owes you anything 🎉" />}
      {dues.map((r) => (
        <Link key={r.sale.id} to={`/sale/${r.sale.id}`}>
          <Card className="mb-2 flex justify-between">
            <div><div className="font-semibold">{r.customer?.name || (r.customer && formatPhone(r.customer.phone))}</div><div className="text-sm text-zinc-400">{linesText(r.sale)}</div></div>
            <b className="text-amber-300">{formatINR(r.due)}</b>
          </Card>
        </Link>
      ))}
    </div>
  );
}
