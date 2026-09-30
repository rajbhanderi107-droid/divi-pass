import { db } from '../db/schema';
import { addInbox, addPayment, createSale, findNearDuplicate, findPaymentByUtr, findSaleByHash, setSetting } from '../db/repo';
import { parseMessage, type Draft } from '../parser';
import { planFromDraft, type DraftPlan } from '../domain/photoDraft';
import { priceFor } from '../domain/pricing';
import { amountDue } from '../domain/status';
import { formatDateLabel, istDate } from '../domain/time';
import { formatINR } from '../domain/money';
import type { EventNight, PassType, Receiver, Sale } from '../domain/types';

export type AutoMode = 'off' | 'clear' | 'always';
export interface IngestCtx {
  passTypes: PassType[]; events: EventNight[]; receivers: Receiver[]; lastReceiverId: string; sellerId?: string;
  season?: { from: string; to: string }; mode: AutoMode; fromPhoto: boolean; today?: string;
}
export interface Added { sale: Sale; summary: string; flags: string[]; paid: number }
export interface IngestResult { added: Added[]; paymentsAdded: string[]; inbox: string[]; duplicates: string[]; fallbackToForm: boolean }

const FLAG_TEXT = (w: string) => {
  if (w === 'no-date') return null;
  if (w === 'multiple-phones') return 'More than one phone number in the message';
  if (w.startsWith('weekday-mismatch:')) return `Weekday does not match the date (${w.slice(17)})`;
  if (w.startsWith('year-assumed:')) return `Year assumed as ${w.slice(13)}`;
  if (w === 'out-of-season') return 'Date is outside your nights';
  if (w.startsWith('amount-mismatch:')) return `Amount in the message differs from your price (${w.slice(16).replace('expected ', 'expected ₹')})`;
  return w;
};

/** In "always" mode: what is missing (must go to the Inbox) and what looks off (saved, but marked Check). */
export function decideAlways(d: Draft, plan: DraftPlan): { ok: boolean; inboxReason?: string; flags: string[] } {
  if (!d.phone) return { ok: false, inboxReason: 'No valid phone number in the message', flags: [] };
  const passCount = Object.values(plan.qty).reduce((a, b) => a + b, 0);
  if (!d.lines.length || passCount === 0 || d.lines.some((l) => l.kind === 'unknown')) return { ok: false, inboxReason: 'Pass type is unclear', flags: [] };
  const flags = plan.warnings.map(FLAG_TEXT).filter((x): x is string => !!x && !x.startsWith('Night '));
  if (!plan.eventId) flags.push(d.eventDate ? `Night ${d.eventDate} is not in your nights — used a nearby night` : 'No date in the message — night was assumed');
  if (/\?/.test(d.sourceText)) flags.push('Some digits could not be read — check the phone and UTR');
  if (passCount > 20) flags.push('Unusually many passes');
  if (plan.pays.reduce((s, p) => s + p.amount, 0) > plan.base) flags.push('Paid more than the total');
  return { ok: true, flags };
}

function fallbackNight(events: EventNight[], today: string): EventNight | undefined {
  return events.find((e) => e.date === today) ?? events.find((e) => e.date > today) ?? events[events.length - 1];
}

async function matchPayment(d: Draft, c: IngestCtx): Promise<{ saleId: string } | 'none' | 'many'> {
  const amount = d.total ?? d.amounts[0];
  if (!amount) return 'none';
  const sales = (await db.sales.toArray()).filter((s) => !s.deletedAt && !s.cancelledAt);
  const pays = (await db.payments.toArray()).filter((p) => !p.deletedAt);
  const cands = sales.filter((s) => amountDue(s, pays.filter((p) => p.saleId === s.id)) === amount);
  return cands.length === 1 ? { saleId: cands[0]!.id } : cands.length === 0 ? 'none' : 'many';
}

/**
 * Turn pasted text (or text read from a photo) into records without asking anything.
 * Sales are saved; payments are attached to the one unpaid sale of that amount; anything that cannot be
 * added safely goes to the Inbox so nothing is lost. Repeats are ignored.
 */
export async function ingestText(text: string, c: IngestCtx): Promise<IngestResult> {
  const out: IngestResult = { added: [], paymentsAdded: [], inbox: [], duplicates: [], fallbackToForm: false };
  const today = c.today ?? istDate();
  const price = (k: 'solo' | 'couple') => c.passTypes.find((p) => p.kind === k)?.price ?? 0;
  const drafts = parseMessage(text, { today, season: c.season, prices: { solo: price('solo'), couple: price('couple') } });
  if (c.mode === 'off' || drafts.length === 0) { out.fallbackToForm = true; return out; }

  if (c.mode === 'clear') {
    const d = drafts[0]!; const plan = planFromDraft(d, { ...c, passTypes: c.passTypes, fromPhoto: c.fromPhoto });
    if (drafts.length !== 1 || !plan.autoOk) { out.fallbackToForm = true; return out; }
  }

  for (const d of drafts) {
    if (d.kind === 'payment') {
      if (d.utr && (await findPaymentByUtr(d.utr))) { out.duplicates.push('payment already recorded'); continue; }
      const m = await matchPayment(d, c);
      if (typeof m === 'object' && d.total) {
        if (d.utr && (await findPaymentByUtr(d.utr))) { out.duplicates.push('payment already recorded'); continue; }
        const rcv = d.party ? c.receivers.find((r) => r.nameLower === d.party!.name.toLowerCase())?.id : undefined;
        await addPayment(m.saleId, { amount: d.total ?? d.amounts[0]!, method: 'upi', utr: d.utr, receiverId: rcv ?? (c.lastReceiverId || undefined), paidAt: d.paidAt });
        out.paymentsAdded.push(`₹${d.total ?? d.amounts[0]}`);
      } else {
        const n = await addInbox(d.sourceText, m === 'many' ? 'Payment fits more than one unpaid sale' : 'Payment with no matching unpaid sale');
        out.inbox.push(n.id);
      }
      continue;
    }

    const plan = planFromDraft(d, { ...c, passTypes: c.passTypes, fromPhoto: c.fromPhoto });
    const dec = c.mode === 'clear' ? { ok: true, flags: [] as string[], inboxReason: undefined } : decideAlways(d, plan);
    if (!dec.ok) { const n = await addInbox(d.sourceText, dec.inboxReason ?? 'Could not read'); out.inbox.push(n.id); continue; }

    if (await findSaleByHash(d.sourceHash)) { out.duplicates.push(d.name ?? d.phone ?? 'message'); continue; }
    let dupUtr = false; for (const p of plan.pays) if (p.utr && (await findPaymentByUtr(p.utr))) dupUtr = true;
    if (dupUtr) { out.duplicates.push(d.name ?? 'payment already recorded'); continue; }

    const ev = c.events.find((e) => e.id === plan.eventId) ?? fallbackNight(c.events, today);
    if (!ev) { const n = await addInbox(d.sourceText, 'No nights set up'); out.inbox.push(n.id); continue; }
    const lines = c.passTypes.filter((p) => (plan.qty[p.id] ?? 0) > 0).map((p) => ({ passTypeId: p.id, qty: plan.qty[p.id]!, unitPrice: priceFor(p, ev) }));
    const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    if (await findNearDuplicate('+91' + plan.phone, total)) { out.duplicates.push(d.name ?? d.phone ?? 'message'); continue; }

    const sale = await createSale({
      eventId: ev.id, name: plan.name, phone: plan.phone, lines, discount: 0, channel: 'whatsapp', sourceText: d.sourceText, sourceHash: d.sourceHash,
      payments: plan.pays.map((p) => ({ amount: p.amount, method: p.utr ? ('upi' as const) : p.method, utr: p.utr || undefined, receiverId: p.receiverId || undefined, paidAt: p.paidAt })),
      needsCheck: dec.flags, sellerId: c.sellerId || undefined,
    });
    const paid = plan.pays.reduce((a, p) => a + p.amount, 0);
    if (plan.pays[0]?.receiverId) await setSetting('lastReceiver', plan.pays[0].receiverId);
    const summary = `${plan.name || '+91 ' + plan.phone} · ${sale.lines.map((l) => `${l.qty} ${l.nameSnap}`).join(' + ')} · ${formatDateLabel(ev.date)} · ${formatINR(sale.total)} · ${paid >= sale.total ? 'paid' : paid > 0 ? `${formatINR(sale.total - paid)} due` : 'unpaid'}`;
    out.added.push({ sale, summary, flags: dec.flags, paid });
  }
  return out;
}
