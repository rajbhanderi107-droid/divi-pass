import type { Customer, Sale } from './types';
import { phoneDigits } from './phone';

export interface PunchField { label: string; value: string }
export interface PunchBlock { index: number; text: string; amount: number; fields: PunchField[] }
export interface QueueItem { sale: Sale; customer?: Pick<Customer, 'name' | 'phone'>; night: string; block: PunchBlock }

/**
 * One block per unpunched line, fields in the Showmates Punch form's order:
 * Date, Ticket, Quantity, Manual amount, Buyer name, Phone.
 * Manual amount is the ACTUAL price charged (not the list price) so Showmates doesn't over-invoice.
 * Any sale discount is taken off the first line. Ticket is the label the organiser set for that pass in Showmates.
 */
export function punchBlocks(sale: Sale, customer: Pick<Customer, 'name' | 'phone'> | undefined, eventDate: string): PunchBlock[] {
  const out: PunchBlock[] = [];
  let discountLeft = sale.discount;
  sale.lines.forEach((l, index) => {
    let amount = l.qty * l.unitPriceSnap;
    const cut = Math.min(discountLeft, amount);
    amount -= cut; discountLeft -= cut;
    if (l.punchedAt) return;
    const fields: PunchField[] = [
      { label: 'Date', value: eventDate }, { label: 'Ticket', value: l.ticketSnap || l.nameSnap },
      { label: 'Quantity', value: String(l.qty) }, { label: 'Manual amount', value: String(amount) },
      { label: 'Buyer name', value: customer?.name ?? '' }, { label: 'Phone', value: customer ? phoneDigits(customer.phone).slice(2) : '' },
    ];
    out.push({ index, text: fields.map((f) => `${f.label}: ${f.value}`).join('\n'), amount, fields });
  });
  return out;
}

/** Every unpunched line across sales, oldest sale first, skipping cancelled sales. */
export function punchQueue(items: { sale: Sale; customer?: Pick<Customer, 'name' | 'phone'>; night: string }[]): QueueItem[] {
  return items
    .filter((i) => !i.sale.cancelledAt)
    .sort((a, b) => a.sale.createdAt - b.sale.createdAt)
    .flatMap((i) => punchBlocks(i.sale, i.customer, i.night).map((block) => ({ ...i, block })));
}
