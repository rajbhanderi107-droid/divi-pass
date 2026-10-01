import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { addPayment, attachToPayment, cancelSale, clearNeedsCheck, deletePayment, deleteSale, DuplicateUtrError, markAllPunched, mergeSales, restorePayment, restoreSale, setLinePunched, setSeller, updateSale, ValidationError } from '../db/repo';
import { useEvents, useReceivers, useSalesView } from '../db/queries';
import { compressForStorage } from '../lib/photo';
import { Btn, Card, Chip, Empty, Field, Pill, Sheet, copyText, inputCls, useToast } from '../components/ui';
import { formatINR, parseRupees } from '../domain/money';
import { formatDateLabel, formatDateTime } from '../domain/time';
import { formatPhone, phoneDigits } from '../domain/phone';
import { amountDue, netPaid, payStatus } from '../domain/status';
import { punchBlocks } from '../domain/showmates';
import { statusLabel, statusTone } from './Sales';
import { relatedPeople } from '../domain/book';
import { useAuth } from '../auth';
import { PunchFields } from '../components/PunchFields';

export function SaleDetail() {
  const { id = '' } = useParams(); const nav = useNavigate(); const toast = useToast();
  const events = useEvents(); const receivers = useReceivers();
  const data = useLiveQuery(async () => {
    const sale = await db.sales.get(id); if (!sale) return null;
    const [customer, payments] = await Promise.all([db.customers.get(sale.customerId), db.payments.where('saleId').equals(id).toArray()]);
    return { sale, customer, payments };
  }, [id]);
  const auth = useAuth(); const role = auth.status === 'in' ? auth.profile.role : 'seller';
  const [paySheet, setPaySheet] = useState<null | 'receipt' | 'refund'>(null); const [editOpen, setEditOpen] = useState(false); const [mergeOpen, setMergeOpen] = useState(false);

  if (data === undefined || !events || !receivers) return null;
  if (data === null) return <Empty text="Sale not found."><Link to="/sales" className="text-sand">Back to sales</Link></Empty>;
  const { sale, customer, payments } = data;
  const live = payments.filter((p) => !p.deletedAt);
  const status = payStatus(sale, live); const due = amountDue(sale, live); const paid = netPaid(live);
  const event = events.find((e) => e.id === sale.eventId);
  const blocks = sale.deletedAt ? [] : punchBlocks(sale, customer, event?.date ?? '');
  const rname = (rid?: string) => receivers.find((r) => r.id === rid)?.name;

  return (
    <div className="space-y-4">
      <button className="text-zinc-400" onClick={() => nav(-1)}>← Back</button>
      {sale.deletedAt && <Card className="border-red-500/50 text-red-200">In trash. <button className="font-bold underline" onClick={() => restoreSale(sale.id)}>Restore</button></Card>}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{customer?.name || (customer && formatPhone(customer.phone))}</h1>
          <div className="text-sm text-zinc-400">{sale.refNo} · {event ? formatDateLabel(event.date) : ''}</div>
          {customer && <div className="mt-1 flex gap-3 text-sm"><a className="text-sand" href={`tel:${customer.phone}`}>{formatPhone(customer.phone)}</a><a className="text-sand" href={`https://wa.me/${phoneDigits(customer.phone)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
        </div>
        <Pill tone={statusTone(status)}>{statusLabel[status]}</Pill>
      </div>

      {receivers.length > 1 && role === 'super' && (
        <Field group label="Sold by">
          <div className="flex gap-2 overflow-x-auto pb-1">{receivers.map((r) => <Chip key={r.id} active={sale.sellerId === r.id} onClick={() => setSeller(sale.id, sale.sellerId === r.id ? '' : r.id)}>{r.name}</Chip>)}</div>
        </Field>
      )}

      {sale.needsCheck?.length ? (
        <Card tone="bark" className="space-y-2 text-sm">
          <div className="font-extrabold">Added automatically — please check</div>
          {sale.needsCheck.map((f) => <div key={f}>⚠ {f}</div>)}
          <Btn onClick={() => clearNeedsCheck(sale.id)}>Looks right</Btn>
        </Card>
      ) : null}
      <Card className="space-y-2">
        {sale.lines.map((l, i) => (
          <label key={i} className="flex min-h-12 items-center justify-between gap-3">
            <span><b>{l.qty} × {l.nameSnap}</b> <span className="text-zinc-400">@ {formatINR(l.unitPriceSnap)}</span>{l.unitPriceSnap !== l.listPriceSnap && <span className="ml-1 text-xs text-zinc-500">(list {formatINR(l.listPriceSnap)})</span>}</span>
            <span className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" className="h-6 w-6 accent-sand" checked={!!l.punchedAt} onChange={(e) => setLinePunched(sale.id, i, e.target.checked)} /> Punched</span>
          </label>
        ))}
        {sale.discount > 0 && <div className="flex justify-between text-sm text-zinc-400"><span>Discount</span><span>−{formatINR(sale.discount)}</span></div>}
        <div className="flex justify-between border-t border-line pt-2"><span>Total</span><b>{formatINR(sale.total)}</b></div>
        <div className="flex justify-between"><span>Paid</span><b className="text-sand">{formatINR(paid)}</b></div>
        {due > 0 && <div className="flex justify-between"><span>Due</span><b className="text-amber-300">{formatINR(due)}</b></div>}
        {status === 'overpaid' && <div className="text-sm text-red-300">Paid {formatINR(paid - sale.total)} more than the total.</div>}
        {status === 'refundDue' && <div className="text-sm text-red-300">Cancelled — refund {formatINR(paid)} to the buyer.</div>}
      </Card>

      {blocks.length > 0 && !sale.cancelledAt && (
        <div className="space-y-2">
          <h2 className="font-semibold text-zinc-300">Copy for Showmates</h2>
          {blocks.map((b) => (
            <Card key={b.index}>
              <PunchFields fields={b.fields} />
              <div className="mt-3 flex gap-2">
                <Btn kind="ghost" className="flex-1" onClick={async () => toast((await copyText(b.text)) ? 'All fields copied' : 'Copy failed')}>Copy all</Btn>
                <Btn className="flex-1" onClick={() => setLinePunched(sale.id, b.index, true)}>Mark punched</Btn>
              </div>
            </Card>
          ))}
          <Link to="/punch" className="block text-center text-sand underline">Punch several in a row →</Link>
          {blocks.length > 1 && <Btn kind="ghost" className="w-full" onClick={() => markAllPunched(sale.id)}>Mark all punched</Btn>}
        </div>
      )}

      <h2 className="font-semibold text-zinc-300">Payments</h2>
      {live.length === 0 && <p className="text-zinc-500">No payments yet.</p>}
      {live.sort((a, b) => a.paidAt - b.paidAt).map((p) => (
        <Card key={p.id} className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{p.kind === 'refund' ? '−' : ''}{formatINR(p.amount)} <span className="text-xs font-normal text-zinc-400">{p.kind === 'refund' ? 'refund' : p.method.toUpperCase()}</span></div>
            <div className="text-xs text-zinc-400">{formatDateTime(p.paidAt)}{rname(p.receiverId) ? ` · to ${rname(p.receiverId)}` : ''}</div>
            {p.utr && <button className="text-xs text-sand" onClick={() => copyText(p.utr!).then(() => toast('UTR copied'))}>UTR {p.utr}</button>}
            <PaymentShot payment={p} />
          </div>
          <button className="px-2 text-red-400" onClick={() => { deletePayment(p.id); toast('Payment removed', { label: 'Undo', run: () => { restorePayment(p.id); } }); }}>Remove</button>
        </Card>
      ))}
      {!sale.deletedAt && (
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setPaySheet('receipt')}>Add payment</Btn>
          <Btn kind="ghost" disabled={paid <= 0} onClick={() => setPaySheet('refund')}>Refund</Btn>
          <Btn kind="ghost" onClick={() => setEditOpen(true)}>Edit</Btn>
          <Btn kind="ghost" disabled={!!sale.cancelledAt} onClick={() => setMergeOpen(true)}>Merge with…</Btn>
          <Btn kind="ghost" onClick={() => cancelSale(sale.id, !sale.cancelledAt)}>{sale.cancelledAt ? 'Un-cancel' : 'Cancel sale'}</Btn>
          <Btn kind="danger" className="col-span-2" onClick={async () => { await deleteSale(sale.id); nav('/sales'); toast('Moved to trash', { label: 'Undo', run: () => { restoreSale(sale.id); } }); }}>Delete</Btn>
        </div>
      )}
      {sale.sourceText && <details className="text-sm text-zinc-400"><summary>Original message</summary><pre className="mt-2 whitespace-pre-wrap">{sale.sourceText}</pre></details>}

      <PaySheet kind={paySheet} onClose={() => setPaySheet(null)} saleId={sale.id} suggested={paySheet === 'refund' ? paid : due} sellerId={sale.sellerId ?? ''} />
      <MergeSheet open={mergeOpen} onClose={() => setMergeOpen(false)} sale={sale} />
      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} sale={sale} />
    </div>
  );
}

function PaySheet({ kind, onClose, saleId, suggested, sellerId }: { kind: null | 'receipt' | 'refund'; onClose: () => void; saleId: string; suggested: number; sellerId: string }) {
  const receivers = useReceivers(); const [amount, setAmount] = useState(''); const [utr, setUtr] = useState('');
  const [rid, setRid] = useState(''); const [method, setMethod] = useState<'upi' | 'cash'>('upi'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [dupSale, setDupSale] = useState('');
  if (!kind) return null;
  const amt = amount === '' ? suggested : parseRupees(amount);
  async function submit() {
    if (busy) return; setErr(''); setDupSale('');
    if (amt === null || amt <= 0) { setErr('Enter a whole-number amount above 0'); return; }
    if (utr && !/^\d{12}$/.test(utr)) { setErr('UTR must be exactly 12 digits'); return; }
    setBusy(true);
    try {
      await addPayment(saleId, { amount: amt, method: utr ? 'upi' : method, utr: utr || undefined, receiverId: rid || undefined }, kind!);
      setAmount(''); setUtr(''); onClose();
    } catch (e) {
      if (e instanceof DuplicateUtrError) { setErr(`UTR ${e.utr} is already recorded.`); setDupSale(e.saleId); }
      else setErr(e instanceof ValidationError ? e.message : 'Could not save payment');
    } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title={kind === 'refund' ? 'Refund' : 'Add payment'}>
      <div className="space-y-3">
        <Field label="Amount"><input className={inputCls} inputMode="numeric" placeholder={String(suggested)} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {kind === 'receipt' && <Field label="UTR (12 digits)"><input className={inputCls} inputMode="numeric" value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))} /></Field>}
        <div className="flex flex-wrap gap-2">
          {receivers && [...receivers].sort((a, b) => Number(relatedPeople(receivers, sellerId).has(b.id)) - Number(relatedPeople(receivers, sellerId).has(a.id))).map((r) => <Chip key={r.id} active={rid === r.id} onClick={() => setRid(rid === r.id ? '' : r.id)}>{r.name}</Chip>)}
          <Chip active={method === 'cash' && !utr} onClick={() => setMethod(method === 'cash' ? 'upi' : 'cash')}>Cash</Chip>
        </div>
        {err && <p role="alert" className="text-red-300">{err} {dupSale && <Link className="underline" to={`/sale/${dupSale}`} onClick={onClose}>View</Link>}</p>}
        <Btn className="w-full" disabled={busy} onClick={submit}>Save</Btn>
      </div>
    </Sheet>
  );
}

function EditSheet({ open, onClose, sale }: { open: boolean; onClose: () => void; sale: import('../domain/types').Sale }) {
  const events = useEvents(); const [lines, setLines] = useState(sale.lines.map((l) => ({ ...l, price: String(l.unitPriceSnap) })));
  const [discount, setDiscount] = useState(String(sale.discount)); const [ev, setEv] = useState(sale.eventId); const [err, setErr] = useState('');
  const [prev, setPrev] = useState(sale.updatedAt);
  if (prev !== sale.updatedAt) { setPrev(sale.updatedAt); setLines(sale.lines.map((l) => ({ ...l, price: String(l.unitPriceSnap) }))); setDiscount(String(sale.discount)); setEv(sale.eventId); }
  async function submit() {
    setErr('');
    const d = parseRupees(discount);
    if (d === null) { setErr('Discount must be whole rupees'); return; }
    const ls = []; for (const l of lines) { const p = parseRupees(l.price); if (p === null) { setErr('Prices must be whole rupees'); return; } ls.push({ passTypeId: l.passTypeId, qty: l.qty, unitPrice: p }); }
    try { await updateSale(sale.id, { lines: ls, discount: d, eventId: ev }); onClose(); } catch (e) { setErr(e instanceof ValidationError ? e.message : 'Could not save'); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Edit sale">
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto">{events?.map((e) => <Chip key={e.id} active={e.id === ev} onClick={() => setEv(e.id)}>{formatDateLabel(e.date)}</Chip>)}</div>
        {lines.map((l, i) => (
          <Card key={i} className="space-y-2">
            <div className="flex items-center justify-between"><b>{l.nameSnap}</b>
              <div className="flex items-center gap-3">
                <button className="h-10 w-10 clay-chip" onClick={() => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                <span className="w-6 text-center">{l.qty}</span>
                <button className="h-10 w-10 rounded-lg bg-sand text-ink" onClick={() => setLines(lines.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
              </div></div>
            <Field label="Price each"><input className={inputCls} inputMode="numeric" value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} /></Field>
            {lines.length > 1 && <button className="text-red-400" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove line</button>}
          </Card>
        ))}
        <Field label="Discount"><input className={inputCls} inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        {err && <p role="alert" className="text-red-300">{err}</p>}
        <Btn className="w-full" onClick={submit}>Save changes</Btn>
      </div>
    </Sheet>
  );
}

function PaymentShot({ payment }: { payment: import('../domain/types').Payment }) {
  const toast = useToast(); const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [url, setUrl] = useState('');
  const att = useLiveQuery(async () => (payment.attachmentId ? db.attachments.get(payment.attachmentId) : undefined), [payment.attachmentId]);
  useEffect(() => {
    if (!att?.blob || att.deletedAt) { setUrl(''); return; }
    const u = URL.createObjectURL(att.blob); setUrl(u); return () => URL.revokeObjectURL(u);
  }, [att]);
  async function pick(f?: File) {
    if (!f) return; setBusy(true);
    try { await attachToPayment(payment.id, await compressForStorage(f)); toast('Screenshot saved'); }
    catch (e) { toast((e as Error).message || 'Could not save the screenshot'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="mt-1 flex items-center gap-2">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Payment screenshot" className="h-12 rounded border border-line" /></a>}
      <button className="text-xs text-zinc-300 underline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving…' : url ? 'Replace screenshot' : '📎 Attach screenshot'}</button>
    </div>
  );
}

function MergeSheet({ open, onClose, sale }: { open: boolean; onClose: () => void; sale: import('../domain/types').Sale }) {
  const views = useSalesView(true); const nav = useNavigate(); const toast = useToast(); const [err, setErr] = useState(''); const [sure, setSure] = useState('');
  if (!open || !views) return null;
  const others = views.filter((v) => v.sale.id !== sale.id && v.sale.customerId === sale.customerId && v.sale.eventId === sale.eventId && !v.sale.cancelledAt);
  return (
    <Sheet open onClose={onClose} title="Merge with…">
      <div className="space-y-2">
        <p className="text-sm text-zinc-400">Combines another sale by the same buyer on the same night into this one. Its passes and payments move here; the other sale goes to Trash. This cannot be undone with one tap.</p>
        {others.length === 0 && <p className="text-zinc-500">No other sale by this buyer on this night.</p>}
        {others.map((v) => (
          <Card key={v.sale.id} className="flex items-center justify-between">
            <div><b>{v.sale.refNo}</b><div className="text-sm text-zinc-400">{v.sale.lines.map((l) => `${l.qty} ${l.nameSnap}`).join(' + ')} · {formatINR(v.sale.total)}</div></div>
            <Btn kind={sure === v.sale.id ? 'danger' : 'primary'} onClick={async () => {
              if (sure !== v.sale.id) { setSure(v.sale.id); return; }
              try { await mergeSales(sale.id, v.sale.id); toast(`Merged ${v.sale.refNo} into ${sale.refNo}`); onClose(); nav(`/sale/${sale.id}`); } catch (e) { setErr(e instanceof ValidationError ? e.message : 'Could not merge'); }
            }}>{sure === v.sale.id ? 'Tap again to merge' : 'Merge'}</Btn>
          </Card>
        ))}
        {err && <p role="alert" className="text-red-300">{err}</p>}
      </div>
    </Sheet>
  );
}
