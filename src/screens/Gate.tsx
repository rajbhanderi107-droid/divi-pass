import { BookBar } from '../components/BookBar';
import { useDeferredValue, useState } from 'react';
import { useWindow } from '../components/Windowed';
import { Link } from 'react-router-dom';
import { setEntered } from '../db/repo';
import { useEvents, useSalesView } from '../db/queries';
import { Card, Chip, Empty, inputCls } from '../components/ui';
import { formatDateLabel, istDate } from '../domain/time';
import { formatPhone } from '../domain/phone';
import type { SaleView } from '../db/queries';
import type { EventNight } from '../domain/types';

export function Gate() {
  const events = useEvents(); const views = useSalesView();
  if (!events || !views) return null;
  return <GateList events={events} views={views} />;
}

function GateList({ events, views }: { events: EventNight[]; views: SaleView[] }) {
  const [sel, setSel] = useState(''); const [q, setQ] = useState('');
  const today = istDate();
  const cur = events.find((e) => e.id === sel) ?? events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[0];
  const list = views.filter((v) => cur && v.sale.eventId === cur.id && !v.sale.cancelledAt);
  const seats = list.reduce((a, v) => a + v.sale.seats, 0); const inside = list.reduce((a, v) => a + (v.sale.entered ?? 0), 0);
  const ql = useDeferredValue(q).trim().toLowerCase(); const qd = ql.replace(/\D/g, '');
  const shown = list.filter((v) => !ql || (v.customer?.nameLower ?? '').includes(ql) || (qd.length >= 3 && v.customer?.phone.includes(qd)) || v.sale.refNo.toLowerCase().includes(ql))
    .sort((a, b) => (a.customer?.nameLower ?? '').localeCompare(b.customer?.nameLower ?? ''));
  const { count, more } = useWindow(shown.length, `${cur?.id}|${ql}`);
  return (
    <div className="space-y-3"><Link to="/more" className="text-zinc-400">← More</Link>
      <h1 className="text-2xl font-bold">Gate list</h1>
      <BookBar />
      <div className="flex gap-2 overflow-x-auto">{events.map((e) => <Chip key={e.id} active={e.id === cur?.id} onClick={() => setSel(e.id)}>{formatDateLabel(e.date)}</Chip>)}</div>
      <Card className="text-center"><div className="text-4xl font-bold text-sand" aria-label="Entered count">{inside}<span className="text-xl text-zinc-400"> / {seats}</span></div><div className="text-sm text-zinc-400">people inside · {seats - inside} still to come</div></Card>
      <input className={inputCls} type="search" placeholder="Search name, phone or DV-number" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 && <Empty text="No buyers for this night." />}
      {shown.slice(0, count).map((v) => {
        const e = v.sale.entered ?? 0;
        return (
          <Card key={v.sale.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{v.customer?.name || (v.customer && formatPhone(v.customer.phone))}</div><div className="text-xs text-zinc-400">{v.sale.refNo} · {v.sale.lines.map((l) => `${l.qty} ${l.nameSnap}`).join(' + ')}</div>{v.due > 0 && <div className="text-xs text-amber-300">Collect at door</div>}</div>
              <div className="text-right text-xl font-bold" aria-label={`${v.customer?.name ?? 'Buyer'} entered`}>{e}/{v.sale.seats}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button aria-label="One less" className="min-h-12 clay-chip text-2xl disabled:opacity-30" disabled={e <= 0} onClick={() => setEntered(v.sale.id, e - 1)}>−</button>
              <button aria-label="One more" className="min-h-12 clay-sand text-2xl disabled:opacity-30" disabled={e >= v.sale.seats} onClick={() => setEntered(v.sale.id, e + 1)}>+</button>
              <button className="min-h-12 clay-chip text-sm font-semibold disabled:opacity-30" disabled={e >= v.sale.seats} onClick={() => setEntered(v.sale.id, v.sale.seats)}>All in</button>
            </div>
          </Card>
        );
      })}
      {more}
    </div>
  );
}
