import type { Receiver } from './types';

/** People whose sales belong in `bookId`'s book: that person, plus anyone who sells on their behalf. Empty bookId = everyone. */
export function bookMembers(people: Receiver[], bookId: string): Set<string> | null {
  if (!bookId) return null;
  const s = new Set([bookId]);
  for (const p of people) if (!p.deletedAt && p.agentOf === bookId) s.add(p.id);
  return s;
}

/** Who can sensibly hold the money for a sale sold by `sellerId`: the seller, who they sell for, and their agents. */
export function relatedPeople(people: Receiver[], sellerId: string): Set<string> {
  const me = people.find((p) => p.id === sellerId); const s = new Set<string>();
  if (!me) return s;
  s.add(me.id); if (me.agentOf) s.add(me.agentOf);
  for (const p of people) if (!p.deletedAt && p.agentOf === me.id) s.add(p.id);
  return s;
}
