import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { seedIfEmpty } from '../db/seed';
import { purgeTrash } from '../db/repo';
import { ToastProvider } from '../components/ui';
import { startSync } from '../sync';
import { Home } from '../screens/Home';
import { Sales } from '../screens/Sales';
import { AddSale } from '../screens/AddSale';
const SaleDetail = lazy(() => import('../screens/SaleDetail').then((m) => ({ default: m.SaleDetail })));
import { Money } from '../screens/Money';
const Punch = lazy(() => import('../screens/Punch').then((m) => ({ default: m.Punch })));
const Inbox = lazy(() => import('../screens/Inbox').then((m) => ({ default: m.Inbox })));
const More = lazy(() => import('../screens/More').then((m) => ({ default: m.More })));

const tabs = [['/', 'Home', '⌂'], ['/sales', 'Sales', '☰'], ['/add', 'Add', '＋'], ['/money', 'Money', '₹'], ['/more', 'More', '⋯']] as const;

export function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string>();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => { seedIfEmpty().then(() => { setReady(true); startSync(); const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2000)); idle(() => { purgeTrash().catch(() => {}); }); }).catch((e) => setErr(String(e?.message ?? e))); }, []);

  if (err) return <div className="p-6"><h1 className="text-xl font-bold">Could not open the database</h1><p className="mt-2 text-zinc-400">{err}</p><p className="mt-2 text-zinc-400">Close other Divi Pass tabs and reload. If it keeps failing, restore from a backup file in a fresh browser.</p></div>;
  if (!ready) return <div className="p-6 text-zinc-400">Loading…</div>;
  return (
    <ToastProvider>
      {needRefresh && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between bg-sand px-4 py-2 text-ink">
          <span className="font-semibold">New version available</span>
          <button className="rounded-lg bg-black px-3 py-1 font-bold text-sand" onClick={() => updateServiceWorker(true)}>Reload</button>
        </div>
      )}
      <main className="mx-auto max-w-xl px-4 pb-safe pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/add" element={<AddSale />} />
          <Route path="/sale/:id" element={<SaleDetail />} />
          <Route path="/punch" element={<Punch />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/money" element={<Money />} />
          <Route path="/more/*" element={<More />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
      </main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 clay-bar pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `mx-0.5 my-1 flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold ${isActive ? 'clay-sand !rounded-2xl' : 'text-zinc-400'}`}>
              <span className={`text-xl leading-none ${to === '/add' ? 'rounded-full bg-sand px-3 py-1 text-ink' : ''}`}>{icon}</span>{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </ToastProvider>
  );
}
