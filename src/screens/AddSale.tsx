import { useEffect, useMemo, useRef, useState } from 'react';
import { useEvents, usePassTypes, useReceivers, useSetting } from '../db/queries';
import { createSale, deleteSale, DuplicateUtrError, findNearDuplicate, findPaymentByUtr, findSaleByHash, setSetting, ValidationError } from '../db/repo';
import { parseMessage, type Draft } from '../parser';
import { Btn, Card, Chip, Field, inputCls, useToast } from '../components/ui';
import { formatINR, parseRupees } from '../domain/money';
import { normalizePhone } from '../domain/phone';
import { formatDateLabel, istDate } from '../domain/time';

interface PayRow { key: number; amount: string; utr: string; receiverId: string; method: 'upi' | 'cash'; paidAt?: number }
const WARN_TEXT = (w: string) => {
  if (w === 'no-date') return 'No date in the message — pick the night below.';
  if (w === 'pass-kind-unknown') return 'Pass type unclear — choose Solo or Couple below.';
  if (w === 'multiple-phones') return 'More than one number found — check the phone.';
  if (w.startsWith('invalid-phone:')) return `Phone ${w.slice(14)} is not a valid mobile number.`;
  if (w.startsWith('weekday-mismatch:')) return `Weekday mismatch (${w.slice(17)}) — check the date.`;
  if (w.startsWith('year-assumed:')) return `Year assumed as ${w.slice(13)}.`;
  if (w === 'out-of-season') return 'Date is outside your nights.';
  if (w.startsWith('amount-mismatch:')) return `Amount in message differs from price list (${w.slice(16)}).`;
  return w;
};
let rowKey = 0;

export function AddSale() {
  const events = useEvents(); const passTypes = usePassTypes(); const receivers = useReceivers();
  const season = useSetting<{ from: string; to: string } | undefined>('season', undefined);
  const lastReceiver = useSetting<string>('lastReceiver', '');
  const toast = useToast();

  const [text, setText] = useState(''); const [drafts, setDrafts] = useState<Draft[]>([]); const [idx, setIdx] = useState(0);
  const [eventId, setEventId] = useState(''); const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [manual, setManual] = useState('');
  const [pays, setPays] = useState<PayRow[]>([]); const [warns, setWarns] = useState<string[]>([]);
  const [source, setSource] = useState<{ text?: string; hash?: string }>({});
  const [error, setError] = useState(''); const [dup, setDup] = useState(''); const [saving, setSaving] = useState(false);
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current || !events?.length) return;
    inited.current = true;
    const today = istDate();
    setEventId((events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[0]!).id);
  }, [events]);

  const base = useMemo(() => (passTypes ?? []).reduce((s, p) => s + (qty[p.id] ?? 0) * p.price, 0), [passTypes, qty]);
  const seats = (passTypes ?? []).reduce((s, p) => s + (qty[p.id] ?? 0) * p.seatsPerUnit, 0);
  const manualVal = manual.trim() === '' ? null : parseRupees(manual);
  const manualBad = manual.trim() !== '' && (manualVal === null || manualVal > base);
  const total = manualVal !== null && !manualBad ? manualVal : base;
  const paidSum = pays.reduce((s, p) => s + (parseRupees(p.amount) ?? 0), 0);

  function reset() {
    setText(''); setDrafts([]); setIdx(0); setQty({}); setName(''); setPhone(''); setManual(''); setPays([]); setWarns([]);
    setSource({}); setError(''); setDup('');
  }

  function applyDraft(d: Draft) {
    if (!passTypes || !events) return;
    setName(d.name ?? ''); setPhone(d.phone ? d.phone.slice(3) : ''); setManual(''); setDup(''); setError('');
    const ev = d.eventDate ? events.find((e) => e.date === d.eventDate) : undefined;
    const w = [...d.warnings];
    if (ev) setEventId(ev.id); else if (d.eventDate) w.push(`Night ${d.eventDate} is not in your nights list — pick one below.`);
    const q: Record<string, number> = {};
    for (const l of d.lines) {
      const pt = passTypes.find((p) => p.kind === l.kind);
      if (pt) q[pt.id] = (q[pt.id] ?? 0) + l.qty;
      else if (l.kind === 'unknown' && !w.includes('pass-kind-unknown')) w.push('pass-kind-unknown');
    }
    setQty(q);
    const rc = (n?: string) => (n ? receivers?.find((r) => r.nameLower === n.toLowerCase())?.id : undefined) ?? lastReceiver;
    const rows: PayRow[] = [];
    if (d.utr && d.total) rows.push({ key: ++rowKey, amount: String(d.total), utr: d.utr, receiverId: rc(d.party?.role === 'paidTo' ? d.party.name : undefined), method: 'upi', paidAt: d.paidAt });
    else if (!d.utr && d.amounts.length > 1) for (const a of d.amounts) rows.push({ key: ++rowKey, amount: String(a), utr: '', receiverId: lastReceiver, method: 'upi' });
    setPays(rows);
    if (d.kind === 'payment') w.push('This looks like a payment only — fill the buyer below.');
    setWarns(w); setSource({ text: d.sourceText, hash: d.sourceHash });
  }

  function onPaste(v: string) {
    setText(v);
    if (!v.trim()) { reset(); return; }
    const ds = parseMessage(v, { season, prices: { solo: passTypes?.find((p) => p.kind === 'solo')?.price ?? 0, couple: passTypes?.find((p) => p.kind === 'couple')?.price ?? 0 } });
    setDrafts(ds); setIdx(0);
    if (ds[0]) applyDraft(ds[0]); else { setWarns(['Nothing recognised — fill the form below.']); }
  }
  async function pasteFromClipboard() {
    try { onPaste(await navigator.clipboard.readText()); } catch { toast('Clipboard blocked — paste into the box instead'); }
  }

  const setStep = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  const addPay = (full?: 'upi' | 'cash') => setPays((p) => [...p, { key: ++rowKey, amount: full ? String(Math.max(0, total - paidSum)) : '', utr: '', receiverId: lastReceiver, method: full ?? 'upi' }]);
  const patchPay = (key: number, patch: Partial<PayRow>) => setPays((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save(force = false) {
    if (saving) return;
    setError(''); setDup('');
    const ph = normalizePhone(phone);
    if (!ph) { setError('Enter a valid 10-digit mobile number.'); return; }
    const lines = (passTypes ?? []).filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ passTypeId: p.id, qty: qty[p.id]! }));
    if (!lines.length) { setError('Add at least one pass.'); return; }
    if (manualBad) { setError(manualVal === null ? 'Amount must be a whole number.' : `Amount is above the price list total (${formatINR(base)}).`); return; }
    const payments = [];
    for (const p of pays) {
      const a = parseRupees(p.amount);
      if (a === null || a <= 0) { setError('Each payment needs a whole-number amount above 0.'); return; }
      if (p.utr && !/^\d{12}$/.test(p.utr)) { setError('UTR must be exactly 12 digits.'); return; }
      payments.push({ amount: a, method: p.utr ? ('upi' as const) : p.method, utr: p.utr || undefined, receiverId: p.receiverId || undefined, paidAt: p.paidAt });
    }
    if (new Set(payments.map((p) => p.utr).filter(Boolean)).size < payments.filter((p) => p.utr).length) { setError('Same UTR entered twice.'); return; }
    setSaving(true);
    try {
      if (!force) {
        if (source.hash) { const s = await findSaleByHash(source.hash); if (s) { setDup(`This message was already added as ${s.refNo}.`); return; } }
        const near = await findNearDuplicate(ph, total);
        if (near) { setDup(`Looks like a repeat: ${near.refNo} has the same number and amount from a few minutes ago.`); return; }
      }
      for (const p of payments) if (p.utr) { const d = await findPaymentByUtr(p.utr); if (d) { setError(`UTR ${p.utr} is already recorded on another sale.`); return; } }
      const sale = await createSale({
        eventId, name, phone: ph, lines, discount: base - total, channel: 'whatsapp',
        sourceText: source.text, sourceHash: source.hash, payments,
      });
      if (payments[0]?.receiverId) setSetting('lastReceiver', payments[0].receiverId);
      navigator.storage?.persist?.().then((ok) => setSetting('storagePersisted', ok)).catch(() => {});
      toast(`Saved ${sale.refNo} · ${formatINR(sale.total)}`, { label: 'Undo', run: () => { deleteSale(sale.id); } });
      const next = drafts[idx + 1];
      if (next) { setIdx(idx + 1); applyDraft(next); } else { reset(); }
    } catch (e) {
      if (e instanceof DuplicateUtrError) setError(`UTR ${e.utr} is already recorded on another sale.`);
      else if (e instanceof ValidationError) setError(e.message);
      else setError('Could not save. Try again, then take a backup.');
    } finally { setSaving(false); }
  }

  if (!events || !passTypes || !receivers) return null;
  const warnList = warns.map(WARN_TEXT);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Add sale</h1>
      <Card className="space-y-2">
        <Field label="Paste WhatsApp message">
          <textarea className={`${inputCls} py-2`} rows={3} value={text} placeholder={'Name : …\nPass : 2 solo\nNo : 99…\nDate : 16th october'} onChange={(e) => onPaste(e.target.value)} />
        </Field>
        <div className="flex gap-2"><Btn kind="ghost" className="flex-1" onClick={pasteFromClipboard}>Paste from clipboard</Btn>{text && <Btn kind="ghost" onClick={reset}>Clear</Btn>}</div>
        {drafts.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">{drafts.map((d, i) => <Chip key={i} active={i === idx} onClick={() => { setIdx(i); applyDraft(d); }}>{i + 1}. {d.name ?? 'Sale'}</Chip>)}</div>
        )}
      </Card>
      {warnList.length > 0 && <Card className="space-y-1 border-amber-500/40 text-sm text-amber-200">{warnList.map((w) => <div key={w}>⚠ {w}</div>)}</Card>}

      <Field group label="Night">
        <div className="flex gap-2 overflow-x-auto pb-1">{events.map((e) => <Chip key={e.id} active={e.id === eventId} onClick={() => setEventId(e.id)}>{formatDateLabel(e.date)}</Chip>)}</div>
      </Field>

      <Field group label="Passes">
        <div className="space-y-2">
          {passTypes.filter((p) => p.active).map((p) => (
            <Card key={p.id} className="flex items-center justify-between py-2">
              <div><div className="font-semibold">{p.name}</div><div className="text-xs text-zinc-400">{formatINR(p.price)} each{p.seatsPerUnit > 1 ? ` · ${p.seatsPerUnit} seats` : ''}</div></div>
              <div className="flex items-center gap-3">
                <button aria-label={`Fewer ${p.name}`} className="h-12 w-12 rounded-xl border border-line text-2xl" onClick={() => setStep(p.id, -1)}>−</button>
                <span className="w-6 text-center text-xl font-bold">{qty[p.id] ?? 0}</span>
                <button aria-label={`More ${p.name}`} className="h-12 w-12 rounded-xl bg-lime text-2xl text-black" onClick={() => setStep(p.id, 1)}>+</button>
              </div>
            </Card>
          ))}
        </div>
      </Field>

      <Field label="Phone" error={phone && !normalizePhone(phone) ? 'Not a valid 10-digit mobile number' : undefined}>
        <input className={inputCls} inputMode="numeric" autoComplete="off" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Buyer name (optional)"><input className={inputCls} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Manual amount (override)" hint={`Leave blank = ${formatINR(base)}`} error={manualBad ? (manualVal === null ? 'Whole rupees only' : `Above price list total ${formatINR(base)}`) : undefined}>
        <input className={inputCls} inputMode="numeric" placeholder="Leave blank = auto" value={manual} onChange={(e) => setManual(e.target.value)} />
      </Field>

      <Field group label={`Payments · ${formatINR(paidSum)} of ${formatINR(total)}`}>
        <div className="space-y-2">
          {pays.map((p) => (
            <Card key={p.key} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="Amount" className={inputCls} inputMode="numeric" placeholder="Amount" value={p.amount} onChange={(e) => patchPay(p.key, { amount: e.target.value })} />
                <input aria-label="UTR" className={inputCls} inputMode="numeric" placeholder="UTR (12 digits)" value={p.utr} onChange={(e) => patchPay(p.key, { utr: e.target.value.replace(/\D/g, '').slice(0, 12) })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {receivers.map((r) => <Chip key={r.id} active={p.receiverId === r.id} onClick={() => patchPay(p.key, { receiverId: p.receiverId === r.id ? '' : r.id })}>{r.name}</Chip>)}
                <Chip active={p.method === 'cash' && !p.utr} onClick={() => patchPay(p.key, { method: p.method === 'cash' ? 'upi' : 'cash' })}>Cash</Chip>
                <button className="ml-auto px-2 text-red-400" onClick={() => setPays((x) => x.filter((r) => r.key !== p.key))}>Remove</button>
              </div>
            </Card>
          ))}
          {paidSum > total && <p className="text-sm text-amber-300">Payments are {formatINR(paidSum - total)} more than the total.</p>}
          <div className="flex gap-2">
            <Btn kind="ghost" className="flex-1" onClick={() => addPay('upi')} disabled={total === 0}>Paid full · UPI</Btn>
            <Btn kind="ghost" className="flex-1" onClick={() => addPay('cash')} disabled={total === 0}>Paid full · Cash</Btn>
            <Btn kind="ghost" onClick={() => addPay()}>+</Btn>
          </div>
        </div>
      </Field>

      {dup && (
        <Card className="space-y-2 border-red-500/50 text-red-200">
          <p>{dup}</p><Btn kind="danger" onClick={() => save(true)}>Save anyway</Btn>
        </Card>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-500/50 p-3 text-red-300">{error}</p>}

      <div className="sticky bottom-14 -mx-4 border-t border-line bg-bg px-4 py-3 mb-[env(safe-area-inset-bottom)]">
        <div className="mb-2 flex justify-between text-sm text-zinc-400"><span>{seats} seat{seats === 1 ? '' : 's'}</span><span className="text-xl font-bold text-white">{formatINR(total)}</span></div>
        <Btn className="w-full" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save sale'}</Btn>
      </div>
    </div>
  );
}
