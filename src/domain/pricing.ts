import type { EventNight, PassType } from './types';

/** Price for a pass on a given night: the night's own price if set, else the pass type's default. */
export function priceFor(pt: Pick<PassType, 'id' | 'price'>, ev?: Pick<EventNight, 'prices'>): number {
  const o = ev?.prices?.[pt.id];
  return o !== undefined && Number.isSafeInteger(o) && o >= 0 ? o : pt.price;
}
