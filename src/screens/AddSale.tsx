import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvents, usePassTypes, useReceivers, useSetting } from '../db/queries';
import { preparePhoto, readPhotoText, ReaderError } from '../lib/photo';
import { createSale, deleteSale, DuplicateUtrError, findNearDuplicate, findPaymentByUtr, findSaleByHash, savePassType, setSetting, ValidationError } from '../db/repo';
import { parseMessage, type Draft } from '../parser';
import { planFromDraft, type DraftPlan } from '../domain/photoDraft';
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
  const [priceOv, setPriceOv] = useState<Record<string, string>>({});
  const [pays, setPays] = useState<PayRow[]>([]); const [warns, setWarns] = useState<string[]>([]);
  const [source, setSource] = useState<{ text?: string; hash?: string }>({});
  const [error, setError] = useState(''); const [dup, setDup] = useState(''); const [saving, setSaving] = useState(false);
  const readerUrl = useSetting<string>('photoReaderUrl', ''); const readerToken = useSetting<string>('photoReaderToken', '');
  const [thumbs, setThumbs] = useState<string[]>([]); const [photoBusy, setPhotoBusy] = useState(false); const [photoErr, setPhotoErr] = useState('');
  const autoSave = useSetting<boolean>('autoSavePhotos', true);
  const [last, setLast] = useState<{ id: string; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current || !events?.length) return;
    inited.current = true;
    const today = istDate();
    setEventId((events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[0]!).id);
  }, [events]);

  const unitOf = (p: { id: string; price: number }) => {
    const v = priceOv[p.id]; if (v === undefined || v.trim() === '') return p.price;
    const n = parseRupees(v); return n === null ? p.price : n;
  };
  const priceBad = (passTypes ?? []).some((p) => priceOv[p.id]?.trim() && parseRupees(priceOv[p.id]!) === null);
  const base = (passTypes ?? []).reduce((s, p) => s + (qty[p.id] ?? 0) * unitOf(p), 0);
  const seats = (passTypes ?? []).reduce((s, p) => s + (qty[p.id] ?? 0) * p.seatsPerUnit, 0);
  const manualVal = manual.trim() === '' ? null : parseRupees(manual);
  const manualBad = manual.trim() !== '' && (manualVal === null || manualVal > base);
  const total = manualVal !== null && !manualBad ? manualVal : base;
  const paidSum = pays.reduce((s, p) => s + (parseRupees(p.amount) ?? 0), 0);

  function reset() {
    setText(''); setDrafts([]); setIdx(0); setQty({}); setName(''); setPhone(''); setManual(''); setPriceOv({}); setPays([]); setWarns([]);
    setSource({}); setError(''); setDup(''); setThumbs((t) => { t.forEach(URL.revokeObjectURL); return []; }); setPhotoErr('');
  }

  const planOf = (d: Draft, fromPhoto: boolean) => planFromDraft(d, { passTypes: passTypes ?? [], events: events ?? [], receivers: receivers ?? [], lastReceiverId: lastReceiver, fromPhoto });

  function applyPlan(d: Draft, p: DraftPlan) {
    setName(p.name); setPhone(p.phone); setManual(''); setPriceOv({}); setDup(''); setError('');
    if (p.eventId) setEventId(p.eventId);
    setQty(p.qty);
    setPays(p.pays.map((x) => ({ key: ++rowKey, amount: String(x.amount), utr: x.utr, receiverId: x.receiverId, method: x.method, paidAt: x.paidAt })));
    const w = [...p.warnings];
    if (d.kind === 'payment') w.push('This looks like a payment only — fill the buyer below.');
    setWarns(w); setSource({ text: d.sourceText, hash: d.sourceHash });
  }
  function applyDraft(d: Draft) { if (passTypes && events) applyPlan(d, planOf(d, false)); }

  function onPaste(v: string) {
    setText(v);
    if (!v.trim()) { reset(); return; }
    const ds = parseMessage(v, { season, prices: { solo: passTypes?.find((p) => p.kind === 'solo')?.price ?? 0, couple: passTypes?.find((p) => p.kind === 'couple')?.price ?? 0 } });
    setDrafts(ds); setIdx(0);
    if (ds[0]) applyDraft(ds[0]); else { setWarns(['Nothing recognised — fill the form below.']); }
  }
  async function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoErr('');
    if (!readerUrl || !readerToken) { setPhotoErr('setup'); return; }
    setPhotoBusy(true);
    try {
      const texts: string[] = []; const previews: string[] = [];
      for (const f of Array.from(files)) {
        const ph = await preparePhoto(f); previews.push(ph.previewUrl);
        const t = await readPhotoText({ url: readerUrl, token: readerToken }, ph.base64, ph.mediaType);
        if (t.trim()) texts.push(t.trim());
      }
      setThumbs((old) => [...old, ...previews]);
      if (!texts.length) { setPhotoErr('Nothing readable in that photo. Try a clearer screenshot or type it in.'); return; }
      const all = [text.trim(), ...texts].filter(Boolean).join('\n\n');
      onPaste(all);
      const ds = parseMessage(all, { season, prices: { solo: passTypes?.find((p) => p.kind === 'solo')?.price ?? 0, couple: passTypes?.find((p) => p.kind === 'couple')?.price ?? 0 } });
      if (autoSave && ds.length === 1) {
        const d = ds[0]!; const plan = planOf(d, true);
        if (plan.autoOk) {
          applyPlan(d, plan);
          const ph = normalizePhone(plan.phone);
          const lines = (passTypes ?? []).filter((x) => (plan.qty[x.id] ?? 0) > 0).map((x) => ({ passTypeId: x.id, qty: plan.qty[x.id]!, unitPrice: x.price }));
          const sale = ph ? await persist({ ph, lines, discount: 0, payments: plan.pays.map((x) => ({ amount: x.amount, method: x.utr ? ('upi' as const) : x.method, utr: x.utr || undefined, receiverId: x.receiverId || undefined, paidAt: x.paidAt })), eventId: plan.eventId!, name: plan.name, hash: d.sourceHash, srcText: d.sourceText, total: plan.base }) : null;
          if (sale) {
            const night = events?.find((e) => e.id === sale.eventId);
            const paid = plan.pays.reduce((a, x) => a + x.amount, 0);
            const summary = `${plan.name || '+91 ' + plan.phone} · ${sale.lines.map((l) => `${l.qty} ${l.nameSnap}`).join(' + ')} · ${night ? formatDateLabel(night.date) : ''} · ${formatINR(sale.total)} · ${paid >= sale.total ? 'paid' : paid > 0 ? `${formatINR(sale.total - paid)} due` : 'unpaid'}`;
            toast(`Added ${sale.refNo}`, { label: 'Undo', run: () => { deleteSale(sale.id); setLast(null); } });
            reset(); setLast({ id: sale.id, text: `${sale.refNo} · ${summary}` });
          }
        }
      }
    } catch (e) {
      setPhotoErr(e instanceof ReaderError ? e.message : 'Could not read that photo.');
    } finally { setPhotoBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function pasteFromClipboard() {
    try { onPaste(await navigator.clipboard.readText()); } catch { toast('Clipboard blocked — paste into the box instead'); }
  }

  const setStep = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  const addPay = (full?: 'upi' | 'cash') => setPays((p) => [...p, { key: ++rowKey, amount: full ? String(Math.max(0, total - paidSum)) : '', utr: '', receiverId: lastReceiver, method: full ?? 'upi' }]);
  const patchPay = (key: number, patch: Partial<PayRow>) => setPays((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  interface PersistArgs { ph: string; lines: { passTypeId: string; qty: number; unitPrice: number }[]; discount: number; payments: { amount: number; method: 'upi' | 'cash' | 'other'; utr?: string; receiverId?: string; paidAt?: number }[]; eventId: string; name: string; hash?: string; srcText?: string; total: number }

  /** Runs the duplicate checks, then saves. Returns the sale, or null when something needs the user's attention (message shown on screen). */
  async function persist(a: PersistArgs, force = false) {
    if (saving) return null;
    setSaving(true);
    try {
      if (!force) {
        if (a.hash) { const s = await findSaleByHash(a.hash); if (s) { setDup(`This message was already added as ${s.refNo}.`); return null; } }
        const near = await findNearDuplicate(a.ph, a.total);
        if (near) { setDup(`Looks like a repeat: ${near.refNo} has the same number and amount from a few minutes ago.`); return null; }
      }
      for (const p of a.payments) if (p.utr) { const d = await findPaymentByUtr(p.utr); if (d) { setError(`UTR ${p.utr} is already recorded on another sale.`); return null; } }
      const sale = await createSale({ eventId: a.eventId, name: a.name, phone: a.ph, lines: a.lines, discount: a.discount, channel: 'whatsapp', sourceText: a.srcText, sourceHash: a.hash, payments: a.payments });
      if (a.payments[0]?.receiverId) setSetting('lastReceiver', a.payments[0].receiverId);
      navigator.storage?.persist?.().then((ok) => setSetting('storagePersisted', ok)).catch(() => {});
      return sale;
    } catch (e) {
      if (e instanceof DuplicateUtrError) setError(`UTR ${e.utr} is already recorded on another sale.`);
      else if (e instanceof ValidationError) setError(e.message);
      else setError('Could not save. Try again, then take a backup.');
      return null;
    } finally { setSaving(false); }
  }

  async function save(force = false) {
    if (saving) return;
    setError(''); setDup('');
    const ph = normalizePhone(phone);
    if (!ph) { setError('Enter a valid 10-digit mobile number.'); return; }
    const lines = (passTypes ?? []).filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ passTypeId: p.id, qty: qty[p.id]!, unitPrice: unitOf(p) }));
    if (!lines.length) { setError('Add at least one pass.'); return; }
    if (priceBad) { setError('Price each must be a whole number of rupees.'); return; }
    if (manualBad) { setError(manualVal === null ? 'Amount must be a whole number.' : `Amount is above the price list total (${formatINR(base)}).`); return; }
    const payments = [];
    for (const p of pays) {
      const a = parseRupees(p.amount);
      if (a === null || a <= 0) { setError('Each payment needs a whole-number amount above 0.'); return; }
      if (p.utr && !/^\d{12}$/.test(p.utr)) { setError('UTR must be exactly 12 digits.'); return; }
      payments.push({ amount: a, method: p.utr ? ('upi' as const) : p.method, utr: p.utr || undefined, receiverId: p.receiverId || undefined, paidAt: p.paidAt });
    }
    if (new Set(payments.map((p) => p.utr).filter(Boolean)).size < payments.filter((p) => p.utr).length) { setError('Same UTR entered twice.'); return; }
    const sale = await persist({ ph, lines, discount: base - total, payments, eventId, name, hash: source.hash, srcText: source.text, total }, force);
    if (!sale) return;
    toast(`Saved ${sale.refNo} · ${formatINR(sale.total)}`, { label: 'Undo', run: () => { deleteSale(sale.id); } });
    const next = drafts[idx + 1];
    if (next) { setIdx(idx + 1); applyDraft(next); } else { reset(); }
  }

  if (!events || !passTypes || !receivers) return null;
  const warnList = warns.map(WARN_TEXT);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Add sale</h1>
      {last && (
        <Card className="flex items-center justify-between gap-2 border-lime/50 text-sm">
          <span>✓ Added {last.text}</span>
          <span className="flex shrink-0 gap-3"><Link to={`/sale/${last.id}`} className="font-semibold text-lime">View</Link><button className="text-red-400" onClick={() => { deleteSale(last.id); setLast(null); }}>Undo</button></span>
        </Card>
      )}
      <Card className="space-y-2">
        <Field label="Paste WhatsApp message">
          <textarea className={`${inputCls} py-2`} rows={3} value={text} placeholder={'Name : …\nPass : 2 solo\nNo : 99…\nDate : 16th october'} onChange={(e) => onPaste(e.target.value)} />
        </Field>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPhotos(e.target.files)} />
        <div className="flex gap-2">
          <Btn className="flex-1" disabled={photoBusy} onClick={() => fileInput.current?.click()}>{photoBusy ? 'Reading photo…' : '📷 Add from photo'}</Btn>
          <Btn kind="ghost" className="flex-1" onClick={pasteFromClipboard}>Paste</Btn>
          {text && <Btn kind="ghost" onClick={reset}>Clear</Btn>}
        </div>
        {photoErr === 'setup' && <p role="alert" className="text-sm text-amber-300">Photo reading is not set up yet. <Link to="/more/photo" className="underline">Set it up</Link></p>}
        {photoErr && photoErr !== 'setup' && <p role="alert" className="text-sm text-red-300">{photoErr}</p>}
        {thumbs.length > 0 && <div className="flex gap-2 overflow-x-auto">{thumbs.map((u) => <img key={u} src={u} alt="Photo being read" className="h-24 rounded-lg border border-line" />)}</div>}
        {thumbs.length > 0 && <p className="text-xs text-zinc-400">Check the name, phone and UTR against the photo before saving.</p>}
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
            <Card key={p.id} className="space-y-2 py-2">
              <div className="flex items-center justify-between">
                <div><div className="font-semibold">{p.name}</div><div className="text-xs text-zinc-400">{p.seatsPerUnit > 1 ? `${p.seatsPerUnit} seats each · ` : ''}list {formatINR(p.listPrice)}</div></div>
                <div className="flex items-center gap-3">
                  <button aria-label={`Fewer ${p.name}`} className="h-12 w-12 rounded-xl border border-line text-2xl" onClick={() => setStep(p.id, -1)}>−</button>
                  <span className="w-6 text-center text-xl font-bold">{qty[p.id] ?? 0}</span>
                  <button aria-label={`More ${p.name}`} className="h-12 w-12 rounded-xl bg-lime text-2xl text-black" onClick={() => setStep(p.id, 1)}>+</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Price each ₹</span>
                <input aria-label={`${p.name} price each`} className={`${inputCls} !min-h-10 w-28 py-1`} inputMode="numeric" placeholder={String(p.price)} value={priceOv[p.id] ?? ''}
                  onChange={(e) => setPriceOv((o) => ({ ...o, [p.id]: e.target.value }))} />
                {priceOv[p.id]?.trim() && unitOf(p) !== p.price && (
                  <button className="text-sm text-lime underline" onClick={async () => {
                    await savePassType({ id: p.id, name: p.name, kind: p.kind, seatsPerUnit: p.seatsPerUnit, listPrice: p.listPrice, price: unitOf(p), active: p.active });
                    setPriceOv((o) => ({ ...o, [p.id]: '' })); toast(`${p.name} default is now ${formatINR(unitOf(p))}`);
                  }}>Make default</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Field>

      <Field label="Phone" error={phone && !normalizePhone(phone) ? 'Not a valid 10-digit mobile number' : undefined}>
        <input className={inputCls} inputMode="numeric" autoComplete="off" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Buyer name (optional)"><input className={inputCls} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Manual amount (override)" hint={`Final total for this sale. Blank = ${formatINR(base)}. To charge more, raise Price each above.`} error={manualBad ? (manualVal === null ? 'Whole rupees only' : `Above price list total ${formatINR(base)}`) : undefined}>
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
