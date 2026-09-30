import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

export function Btn({ kind = 'primary', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button {...p} className={cx('min-h-12 rounded-xl px-4 font-semibold disabled:opacity-40 active:scale-[.98] transition',
      kind === 'primary' && 'bg-lime text-black', kind === 'ghost' && 'border border-line bg-card text-white', kind === 'danger' && 'border border-red-500/50 text-red-400', className)} />
  );
}
export function Chip({ active, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button {...p} className={cx('min-h-10 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap', active ? 'border-lime bg-lime/15 text-lime' : 'border-line bg-card text-zinc-300', className)} />;
}
export function Field({ label, hint, error, group, children }: { label: string; hint?: string; error?: string; group?: boolean; children: ReactNode }) {
  const body = (
    <>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-400">{error}</span> : hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </>
  );
  // Groups of buttons/inputs must not sit inside a <label>: it would rename every control inside.
  return group ? <div role="group" aria-label={label}>{body}</div> : <label className="block">{body}</label>;
}
export const inputCls = 'w-full min-h-12 rounded-xl border border-line bg-[#101610] px-3 text-white placeholder:text-zinc-500 focus:border-lime focus:outline-none';
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div {...p} className={cx('rounded-2xl border border-line bg-card p-4', className)} />;
export const Empty = ({ text, children }: { text: string; children?: ReactNode }) => (
  <div className="py-12 text-center text-zinc-400"><p className="mb-4">{text}</p>{children}</div>
);
export const Pill = ({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray'; children: ReactNode }) => (
  <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', tone === 'green' && 'bg-lime/20 text-lime', tone === 'amber' && 'bg-amber-500/20 text-amber-300', tone === 'red' && 'bg-red-500/20 text-red-300', tone === 'gray' && 'bg-zinc-700/50 text-zinc-300')}>{children}</span>
);

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div role="dialog" aria-label={title} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-bg p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button aria-label="Close" className="h-10 w-10 text-2xl text-zinc-400" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastMsg | null>(null); const id = useRef(0);
  const show = useCallback((text: string, action?: ToastMsg['action']) => { setT({ id: ++id.current, text, action }); }, []);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), 6000); return () => clearTimeout(h); }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 flex items-center justify-between gap-3 rounded-xl border border-line bg-[#1b241d] px-4 py-3 shadow-xl">
          <span>{t.text}</span>
          {t.action && <button className="font-bold text-lime" onClick={() => { t.action!.run(); setT(null); }}>{t.action.label}</button>}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
