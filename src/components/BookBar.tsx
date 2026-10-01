import { useBook, useReceivers } from '../db/queries';
import { setSetting } from '../db/repo';
import { useAuth } from '../auth';
import { Chip } from './ui';

/** Picks whose sales every screen shows: everyone, or one seller (with anyone who sells for them). */
export function BookBar() {
  const people = useReceivers(); const book = useBook(); const a = useAuth();
  if (!people || people.length < 2 || (a.status === 'in' && a.profile.role !== 'super')) return null;
  return (
    <div role="group" aria-label="Whose sales" className="flex gap-2 overflow-x-auto pb-1">
      <Chip active={!book} onClick={() => setSetting('book', '')}>Everyone</Chip>
      {people.map((p) => <Chip key={p.id} active={book === p.id} onClick={() => setSetting('book', p.id)}>{p.name}</Chip>)}
    </div>
  );
}
