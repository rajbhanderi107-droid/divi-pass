import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvents, useInbox, usePassTypes, useSalesView, useSetting } from '../db/queries';
import { setSetting } from '../db/repo';
import { Card, Empty } from '../components/ui';
import { Leaves } from '../components/Leaves';
import { formatINR } from '../domain/money';
import { formatDateLabel, istDate } from '../domain/time';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function Home() {
  const sales = useSalesView(); const events = useEvents();
  const lastBackup = useSetting<number | null>('lastBackupAt', null);
  const since = useSetting<number>('salesSinceBackup', 0);
  const persisted = useSetting<boolean | null>('storagePersisted', null);
  const pricesOk = useSetting<boolean>('pricesConfirmed', false);
  const passTypes = usePassTypes(); const inbox = useInbox();
  const [today] = useState(() => istDate());

  useEffect(() => {
    navigator.storage?.persisted?.().then((p) => setSetting('storagePersisted', p)).catch(() => {});
  }, []);

  if (!sales || !events || !inbox) return null;
  const active = sales.filter((s) => !s.sale.cancelledAt);
  const dues = active.reduce((a, s) => a + s.due, 0);
  const unpunched = active.filter((s) => s.sale.punchState !== 'done').length;
  const toCheck = sales.filter((x) => x.sale.needsCheck?.length && !x.sale.cancelledAt).length;
  const linesToPunch = active.reduce((a, s) => a + s.sale.lines.filter((l) => !l.punchedAt).length, 0);
  const collected = sales.reduce((a, s) => a + s.payments.reduce((x, p) => x + (p.kind === 'receipt' ? p.amount : -p.amount), 0), 0);
  const tonight = events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[0];
  const tonightSeats = tonight ? active.filter((x) => x.sale.eventId === tonight.id).reduce((a, x) => a + x.sale.seats, 0) : 0;
  const overdue = since >= 10 || (since > 0 && (!lastBackup || Date.now() - lastBackup > 2 * 86_400_000)) || (!lastBackup && sales.length > 0);

  const banners: { key: string; text: string; to?: string }[] = [];
  if (isIOS() && !isStandalone()) banners.push({ key: 'ios', text: 'Tap Share → "Add to Home Screen". iPhone can erase data of sites you do not install.' });
  else if (persisted === false && sales.length > 0) banners.push({ key: 'persist', text: 'Phone may clear this app’s data. Install it to the home screen and keep backups.', to: '/more/backup' });
  if (overdue) banners.push({ key: 'backup', text: `Backup due — ${since} new ${since === 1 ? 'sale' : 'sales'} since last backup.`, to: '/more/backup' });

  return (
    <div className="space-y-4">
      <div className="surface surface-hero relative overflow-hidden p-5">
        <Leaves className="pointer-events-none absolute -right-3 -top-2 h-40 w-44 opacity-95" />
        <div className="relative max-w-[62%] space-y-1">
          <div className="text-xs font-bold uppercase tracking-[.14em] text-sand/80">Divya Achariya Divi</div>
          <h1 className="text-3xl font-extrabold leading-tight text-cream">Divi Pass</h1>
          <p className="text-sm text-cream/85">{tonight ? `${formatDateLabel(tonight.date)} · ${tonightSeats} seat${tonightSeats === 1 ? '' : 's'} sold` : 'Your pass register'}</p>
        </div>
        <Link to="/add" className="btn-sand relative mt-4 inline-block rounded-full px-6 py-3 font-extrabold">＋ Add a sale</Link>
      </div>
      {(inbox.length > 0 || toCheck > 0) && (
        <Card tone="bark" className="space-y-2">
          <div className="font-extrabold">Needs you</div>
          {inbox.length > 0 && <Link to="/inbox" className="block text-sm">📥 {inbox.length} message{inbox.length === 1 ? '' : 's'} the app could not add — <b className="underline">open Inbox</b></Link>}
          {toCheck > 0 && <Link to="/sales?f=check" className="block text-sm">⚠ {toCheck} sale{toCheck === 1 ? '' : 's'} added automatically with something to check — <b className="underline">review</b></Link>}
        </Card>
      )}
      {!pricesOk && passTypes && (
        <Card className="space-y-2 border-sand/40 text-sm">
          <div><b>Check your prices and nights.</b> They start as guesses ({passTypes.map((p) => `${p.name} ${formatINR(p.price)}`).join(' · ')}). Prices change a lot, so set them your way — you can also change the price on any sale from the Add screen.</div>
          <div className="flex flex-wrap gap-2">
            <Link to="/more/passes" className="btn-sand rounded-full px-4 py-2 font-bold">Set prices</Link>
            <Link to="/more/nights" className="clay-chip px-4 py-2 font-semibold">Set nights</Link>
            <button className="clay-chip px-4 py-2" onClick={() => setSetting('pricesConfirmed', true)}>They’re right</button>
          </div>
        </Card>
      )}
      {banners.map((b) => (
        <Card key={b.key} tone="bark" className="text-sm text-cream">
          {b.to ? <Link to={b.to}>{b.text} <b>Back up →</b></Link> : b.text}
        </Card>
      ))}
      {linesToPunch > 0 && <Link to="/punch" className="btn-sand block rounded-full px-4 py-3 text-center font-extrabold">Punch in Showmates · {linesToPunch} to do →</Link>}
      <div className="grid grid-cols-3 gap-2">
        <Link to="/sales?f=unpaid"><Card tone="bark" className="h-full"><div className="text-xs font-semibold opacity-80">Dues</div><div className="text-xl font-extrabold text-sand">{formatINR(dues)}</div></Card></Link>
        <Link to="/sales?f=unpunched"><Card tone="sage" className="h-full"><div className="text-xs font-semibold opacity-80">Unpunched</div><div className="text-xl font-extrabold">{unpunched}</div></Card></Link>
        <Card tone="deep" className="h-full"><div className="text-xs font-semibold opacity-80">Collected</div><div className="text-xl font-extrabold text-sand">{formatINR(collected)}</div></Card>
      </div>
      <h2 className="text-lg font-extrabold text-cream">Nights</h2>
      {sales.length === 0 && <Empty text="No sales yet. Tap + and paste a WhatsApp message.">{<Link to="/add" className="btn-sand rounded-full px-5 py-3 font-extrabold">Add first sale</Link>}</Empty>}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {events.map((e) => {
          const es = active.filter((s) => s.sale.eventId === e.id);
          const seats = es.reduce((a, s) => a + s.sale.seats, 0);
          const due = es.reduce((a, s) => a + s.due, 0);
          const un = es.filter((s) => s.sale.punchState !== 'done').length;
          return (
            <Link key={e.id} to={`/sales?night=${e.id}`} className="shrink-0">
              <Card className={`w-36 ${e.date === today ? 'border-sand' : ''}`}>
                <div className="text-sm font-semibold">{formatDateLabel(e.date)}{e.date === today && <span className="ml-1 text-sand">• today</span>}</div>
                <div className="mt-2 text-2xl font-bold">{seats}<span className="ml-1 text-xs font-normal text-zinc-400">seats</span></div>
                <div className="text-xs text-amber-300">{due ? `${formatINR(due)} due` : ' '}</div>
                <div className="text-xs text-zinc-400">{un ? `${un} unpunched` : ' '}</div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
