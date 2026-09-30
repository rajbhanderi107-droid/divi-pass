import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { setLinePunched, setLineTicket, savePassType, setSetting } from '../db/repo';
import { useEvents, usePassTypes, useSalesView, useSetting } from '../db/queries';
import { Btn, Card, Chip, Empty, inputCls, useToast } from '../components/ui';
import { PunchFields } from '../components/PunchFields';
import { punchQueue, type QueueItem } from '../domain/showmates';
import { formatDateLabel, istDate } from '../domain/time';
import { formatINR } from '../domain/money';

export const SHOWMATES_URL = 'https://seller.showmates.in/punch';

export function Punch() {
  const views = useSalesView(); const events = useEvents(); const passTypes = usePassTypes(); const toast = useToast();
  const url = useSetting<string>('showmatesUrl', SHOWMATES_URL);
  const [night, setNight] = useState<string>('today'); const [skipped, setSkipped] = useState<string[]>([]); const [last, setLast] = useState<QueueItem | null>(null);
  const today = istDate();
  const queue = useMemo(() => {
    if (!views) return [];
    const all = punchQueue(views.map((v) => ({ sale: v.sale, customer: v.customer, night: v.event?.date ?? '' })));
    return night === 'all' ? all : all.filter((q) => q.night === (night === 'today' ? (events?.find((e) => e.date === today) ?? events?.find((e) => e.date > today))?.date : night));
  }, [views, events, night, today]);
  if (!views || !events || !passTypes) return null;

  const key = (q: QueueItem) => `${q.sale.id}:${q.block.index}`;
  // Skipped lines go to the back of the queue.
  const ordered = [...queue.filter((q) => !skipped.includes(key(q))), ...queue.filter((q) => skipped.includes(key(q)))];
  const cur = ordered[0];
  const pt = cur ? passTypes.find((p) => p.id === cur.sale.lines[cur.block.index]!.passTypeId) : undefined;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-zinc-400">← Home</Link>
      <h1 className="text-2xl font-bold">Punch in Showmates</h1>
      <div className="flex gap-2 overflow-x-auto">
        <Chip active={night === 'today'} onClick={() => setNight('today')}>Tonight / next</Chip>
        <Chip active={night === 'all'} onClick={() => setNight('all')}>All nights</Chip>
        {events.map((e) => <Chip key={e.id} active={night === e.date} onClick={() => setNight(e.date)}>{formatDateLabel(e.date)}</Chip>)}
      </div>

      {!cur ? (
        <Empty text="Everything is punched 🎉" />
      ) : (
        <>
          <a href={url || SHOWMATES_URL} target="_blank" rel="noreferrer" className="btn-sand block min-h-14 rounded-full px-4 py-4 text-center text-lg font-extrabold">Open Showmates Punch ↗</a>
          <p className="text-center text-sm text-zinc-400">{ordered.length} line{ordered.length === 1 ? '' : 's'} to punch · copy each field, paste it in Showmates, then tap Done</p>
          <Card className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-xl font-bold">{cur.customer?.name || cur.customer?.phone}</div><div className="text-sm text-zinc-400">{cur.sale.refNo} · line {cur.block.index + 1} of {cur.sale.lines.length}</div></div>
              <div className="text-right text-xl font-bold">{formatINR(cur.block.amount)}</div>
            </div>
            <PunchFields fields={cur.block.fields} ticketSlot={
              <TicketEditor key={key(cur)} value={cur.block.fields[1]!.value}
                onSaveLine={(v) => setLineTicket(cur.sale.id, cur.block.index, v).then(() => toast('Ticket name saved for this sale'))}
                onSaveAll={pt ? (v) => savePassType({ id: pt.id, name: pt.name, kind: pt.kind, seatsPerUnit: pt.seatsPerUnit, listPrice: pt.listPrice, price: pt.price, active: pt.active, showmatesName: v }).then(() => toast(`New ${pt.name} sales will use “${v}”`)) : undefined}
                passName={pt?.name} />
            } />
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Btn className="col-span-2" onClick={async () => { await setLinePunched(cur.sale.id, cur.block.index, true); setLast(cur); toast('Marked punched'); }}>Done — punched</Btn>
              <Btn kind="ghost" onClick={() => setSkipped((s) => [...s.filter((x) => x !== key(cur)), key(cur)])}>Skip</Btn>
            </div>
          </Card>
        </>
      )}
      {last && <Btn kind="ghost" className="w-full" onClick={async () => { await setLinePunched(last.sale.id, last.block.index, false); setLast(null); toast('Put back in the queue'); }}>Undo last “punched”</Btn>}

      {ordered.length > 1 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-zinc-300">Up next</h2>
          {ordered.slice(1, 6).map((q) => (
            <Card key={key(q)} className="flex items-center justify-between py-2 text-sm">
              <span>{q.customer?.name || q.customer?.phone} · {q.block.fields[2]!.value} × {q.block.fields[1]!.value}</span><b>{formatINR(q.block.amount)}</b>
            </Card>
          ))}
        </div>
      )}
      <details className="text-sm text-zinc-400"><summary>Showmates link</summary>
        <div className="mt-2 flex gap-2"><input className={inputCls} defaultValue={url} aria-label="Showmates punch link" onBlur={(e) => setSetting('showmatesUrl', e.target.value.trim() || SHOWMATES_URL)} /></div>
        <p className="mt-1">Showmates has no connection for other apps, so this screen makes each field one tap to copy. It cannot fill their form or punch for you.</p>
      </details>
    </div>
  );
}

function TicketEditor({ value, onSaveLine, onSaveAll, passName }: { value: string; onSaveLine: (v: string) => Promise<unknown>; onSaveAll?: (v: string) => Promise<unknown>; passName?: string }) {
  const [v, setV] = useState(value); const changed = v.trim() !== value && v.trim() !== '';
  return (
    <div className="space-y-1">
      <input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} aria-label="Ticket name in Showmates" />
      <div className="text-xs text-zinc-500">Same wording as Showmates’ Ticket list, e.g. “EARLY BIRD | SINGLE”.</div>
      {changed && (
        <div className="flex flex-wrap gap-2">
          <button className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => onSaveLine(v)}>Use for this sale</button>
          {onSaveAll && <button className="min-h-10 rounded-lg border border-line px-3 text-sm" onClick={() => onSaveAll(v.trim())}>Use for all {passName} sales</button>}
        </div>
      )}
    </div>
  );
}
