import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Draw long lists a page at a time. The next page loads as the end comes near, so a season of thousands of rows
 * costs the same as a few dozen. `resetKey` sends the list back to the first page (new search or filter).
 */
export function useWindow(total: number, resetKey: unknown, step = 30): { count: number; more: ReactNode } {
  const [n, setN] = useState(step);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { setN(step); }, [resetKey, step]);
  useEffect(() => {
    const el = end.current;
    if (!el || n >= total) return;
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) setN((x) => Math.min(total, x + step)); }, { rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [n, total, step]);
  const count = Math.min(n, total);
  return { count, more: count < total ? <div ref={end} className="py-4 text-center text-sm text-zinc-400">Showing {count} of {total}…</div> : null };
}
