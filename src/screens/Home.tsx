import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvents, useSalesView, useSetting } from '../db/queries';
import { setSetting } from '../db/repo';
import { Card, Empty } from '../components/ui';
import { formatINR } from '../domain/money';
import { formatDateLabel, istDate } from '../domain/time';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function Home() {
  const sales = useSalesView(); const events = useEvents();
  const lastBackup = useSetting<number | null>('lastBackupAt', null);
  const since = useSetting<number>('salesSinceBackup', 0);
  const persisted = useSetting<boolean | null>('storagePersisted', null);
  const [today] = useState(() => istDate());

  useEffect(() => {
    navigator.storage?.persisted?.().then((p) => setSetting('storagePersisted', p)).catch(() => {});
  }, []);

  if (!sales || !events) return null;
  const active = sales.filter((s) => !s.sale.cancelledAt);
  const dues = active.reduce((a, s) => a + s.due, 0);
  const unpunched = active.filter((s) => s.sale.punchState !== 'done').length;
  const collected = sales.reduce((a, s) => a + s.payments.reduce((x, p) => x + (p.kind === 'receipt' ? p.amount : -p.amount), 0), 0);
  const overdue = since >= 10 || (since > 0 && (!lastBackup || Date.now() - lastBackup > 2 * 86_400_000)) || (!lastBackup && sales.length > 0);

  const banners: { key: string; text: string; to?: string }[] = [];
  if (isIOS() && !isStandalone()) banners.push({ key: 'ios', text: 'Tap Share → "Add to Home Screen". iPhone can erase data of sites you do not install.' });
  else if (persisted === false && sales.length > 0) banners.push({ key: 'persist', text: 'Phone may clear this app’s data. Install it to the home screen and keep backups.', to: '/more/backup' });
  if (overdue) banners.push({ key: 'backup', text: `Backup due — ${since} new ${since === 1 ? 'sale' : 'sales'} since last backup.`, to: '/more/backup' });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Divi Pass</h1>
      {banners.map((b) => (
        <Card key={b.key} className="border-amber-500/40 text-sm text-amber-200">
          {b.to ? <Link to={b.to}>{b.text} <b>Back up →</b></Link> : b.text}
        </Card>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <Link to="/sales?f=unpaid"><Card><div className="text-xs text-zinc-400">Dues</div><div className="text-xl font-bold text-amber-300">{formatINR(dues)}</div></Card></Link>
        <Link to="/sales?f=unpunched"><Card><div className="text-xs text-zinc-400">Unpunched</div><div className="text-xl font-bold">{unpunched}</div></Card></Link>
        <Card><div className="text-xs text-zinc-400">Collected</div><div className="text-xl font-bold text-lime">{formatINR(collected)}</div></Card>
      </div>
      <h2 className="font-semibold text-zinc-300">Nights</h2>
      {sales.length === 0 && <Empty text="No sales yet. Tap + and paste a WhatsApp message.">{<Link to="/add" className="rounded-xl bg-lime px-5 py-3 font-bold text-black">Add first sale</Link>}</Empty>}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {events.map((e) => {
          const es = active.filter((s) => s.sale.eventId === e.id);
          const seats = es.reduce((a, s) => a + s.sale.seats, 0);
          const due = es.reduce((a, s) => a + s.due, 0);
          const un = es.filter((s) => s.sale.punchState !== 'done').length;
          return (
            <Link key={e.id} to={`/sales?night=${e.id}`} className="shrink-0">
              <Card className={`w-36 ${e.date === today ? 'border-lime' : ''}`}>
                <div className="text-sm font-semibold">{formatDateLabel(e.date)}{e.date === today && <span className="ml-1 text-lime">• today</span>}</div>
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
