import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { seedIfEmpty } from '../db/seed';
import { purgeTrash } from '../db/repo';
import { ToastProvider } from '../components/ui';
import { Home } from '../screens/Home';
import { Sales } from '../screens/Sales';
import { AddSale } from '../screens/AddSale';
import { SaleDetail } from '../screens/SaleDetail';
import { Money } from '../screens/Money';
import { More } from '../screens/More';

const tabs = [['/', 'Home', '⌂'], ['/sales', 'Sales', '☰'], ['/add', 'Add', '＋'], ['/money', 'Money', '₹'], ['/more', 'More', '⋯']] as const;

export function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string>();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => { seedIfEmpty().then(() => purgeTrash()).then(() => setReady(true)).catch((e) => setErr(String(e?.message ?? e))); }, []);

  if (err) return <div className="p-6"><h1 className="text-xl font-bold">Could not open the database</h1><p className="mt-2 text-zinc-400">{err}</p><p className="mt-2 text-zinc-400">Close other Divi Pass tabs and reload. If it keeps failing, restore from a backup file in a fresh browser.</p></div>;
  if (!ready) return <div className="p-6 text-zinc-400">Loading…</div>;
  return (
    <ToastProvider>
      {needRefresh && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between bg-lime px-4 py-2 text-black">
          <span className="font-semibold">New version available</span>
          <button className="rounded-lg bg-black px-3 py-1 font-bold text-lime" onClick={() => updateServiceWorker(true)}>Reload</button>
        </div>
      )}
      <main className="mx-auto max-w-xl px-4 pb-safe pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/add" element={<AddSale />} />
          <Route path="/sale/:id" element={<SaleDetail />} />
          <Route path="/money" element={<Money />} />
          <Route path="/more/*" element={<More />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center text-xs ${isActive ? 'text-lime' : 'text-zinc-400'}`}>
              <span className={`text-xl leading-none ${to === '/add' ? 'rounded-full bg-lime px-3 py-1 text-black' : ''}`}>{icon}</span>{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </ToastProvider>
  );
}
