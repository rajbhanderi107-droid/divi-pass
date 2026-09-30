import { Link, useNavigate } from 'react-router-dom';
import { removeInbox } from '../db/repo';
import { useInbox } from '../db/queries';
import { Btn, Card, Empty } from '../components/ui';
import { formatDateTime } from '../domain/time';

export function Inbox() {
  const items = useInbox(); const nav = useNavigate();
  if (!items) return null;
  return (
    <div className="space-y-3">
      <Link to="/" className="text-zinc-400">← Home</Link>
      <h1 className="text-2xl font-extrabold">Inbox</h1>
      <p className="text-sm text-zinc-400">Messages the app could not add by itself. Everything else was added automatically.</p>
      {items.length === 0 && <Empty text="Nothing waiting for you 🎉" />}
      {items.map((i) => (
        <Card key={i.id} tone="bark" className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm"><b>{i.reason}</b><span className="text-cream/70">{formatDateTime(i.createdAt)}</span></div>
          <pre className="whitespace-pre-wrap break-words rounded-2xl bg-black/25 p-3 text-sm">{i.text}</pre>
          <div className="flex gap-2">
            <Btn className="flex-1" onClick={() => nav('/add', { state: { inbox: { id: i.id, text: i.text } } })}>Fix and add</Btn>
            <Btn kind="ghost" onClick={() => removeInbox(i.id)}>Dismiss</Btn>
          </div>
        </Card>
      ))}
    </div>
  );
}
