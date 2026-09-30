import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { Card, Chip, Empty } from '../components/ui';
import { formatDateTime } from '../domain/time';

export function Audit() {
  const [ent, setEnt] = useState('all');
  const rows = useLiveQuery(async () => {
    const [log, sales] = await Promise.all([db.auditLog.orderBy('seq').reverse().limit(300).toArray(), db.sales.toArray()]);
    const ref = new Map(sales.map((s) => [s.id, s.refNo]));
    return log.map((r) => ({ ...r, ref: r.entity === 'sale' ? ref.get(r.entityId) : undefined }));
  }, []);
  if (!rows) return null;
  const shown = rows.filter((r) => ent === 'all' || r.entity === ent);
  return (
    <div className="space-y-3"><Link to="/more" className="text-zinc-400">← More</Link>
      <h1 className="text-2xl font-bold">Change history</h1>
      <div className="flex gap-2 overflow-x-auto">{['all', 'sale', 'payment', 'expense', 'backup'].map((e) => <Chip key={e} active={ent === e} onClick={() => setEnt(e)}>{e}</Chip>)}</div>
      {shown.length === 0 && <Empty text="Nothing yet." />}
      {shown.map((r) => <Card key={r.seq} className="py-2 text-sm"><div className="flex justify-between"><b>{r.entity} · {r.action}</b><span className="text-zinc-400">{formatDateTime(r.at)}</span></div>{r.ref && <Link to={`/sale/${r.entityId}`} className="text-lime">{r.ref}</Link>}</Card>)}
    </div>
  );
}
