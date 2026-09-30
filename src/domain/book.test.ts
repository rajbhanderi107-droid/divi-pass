import { describe, expect, it } from 'vitest';
import { bookMembers, relatedPeople } from './book';
import type { Receiver } from './types';

const p = (id: string, agentOf?: string): Receiver => ({ id, name: id, nameLower: id, createdAt: 0, updatedAt: 0, ...(agentOf ? { agentOf } : {}) });
const people = [p('raj'), p('dev'), p('divya', 'raj')];

describe('seller books', () => {
  it('everyone sees all', () => expect(bookMembers(people, '')).toBeNull());
  it("Raj's book includes Divya's sales", () => expect([...bookMembers(people, 'raj')!].sort()).toEqual(['divya', 'raj']));
  it("Divya's book is only hers", () => expect([...bookMembers(people, 'divya')!]).toEqual(['divya']));
  it("Dev's book is separate", () => expect([...bookMembers(people, 'dev')!]).toEqual(['dev']));
  it('money for a Divya sale goes to Divya or Raj, not Dev', () => expect([...relatedPeople(people, 'divya')].sort()).toEqual(['divya', 'raj']));
  it('money for a Raj sale goes to Raj or Divya', () => expect([...relatedPeople(people, 'raj')].sort()).toEqual(['divya', 'raj']));
});
