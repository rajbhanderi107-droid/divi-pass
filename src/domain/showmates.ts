import type { Customer, Sale } from './types';
import { phoneDigits } from './phone';

export interface PunchBlock { index: number; text: string; amount: number }

/**
 * One block per unpunched line, in the Showmates Punch form's order.
 * Manual amount is the ACTUAL price charged (not the ₹800 list price) so Showmates doesn't over-invoice.
 * Any sale discount is taken off the first line.
 */
export function punchBlocks(sale: Sale, customer: Pick<Customer, 'name' | 'phone'> | undefined, eventDate: string): PunchBlock[] {
  const out: PunchBlock[] = [];
  let discountLeft = sale.discount;
  sale.lines.forEach((l, index) => {
    let amount = l.qty * l.unitPriceSnap;
    const cut = Math.min(discountLeft, amount);
    amount -= cut; discountLeft -= cut;
    if (l.punchedAt) return;
    const text = [
      `Date: ${eventDate}`, `Ticket: ${l.nameSnap}`, `Quantity: ${l.qty}`, `Manual amount: ${amount}`,
      `Buyer name: ${customer?.name ?? ''}`, `Phone: ${customer ? phoneDigits(customer.phone).slice(2) : ''}`,
    ].join('\n');
    out.push({ index, text, amount });
  });
  return out;
}
