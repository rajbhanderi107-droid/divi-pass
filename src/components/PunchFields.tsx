import { copyText, useToast } from './ui';
import type { PunchField } from '../domain/showmates';

/** One row per Showmates form field with its own Copy button, in the form's order. */
export function PunchFields({ fields, ticketSlot }: { fields: PunchField[]; ticketSlot?: React.ReactNode }) {
  const toast = useToast();
  return (
    <ul className="divide-y divide-line">
      {fields.map((f) => (
        <li key={f.label} className="flex min-h-14 items-center justify-between gap-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-zinc-400">{f.label}</div>
            {f.label === 'Ticket' && ticketSlot ? ticketSlot : <div className="break-words text-lg font-semibold">{f.value || '—'}</div>}
          </div>
          <button className="min-h-11 shrink-0 clay-chip px-4 font-bold" disabled={!f.value}
            onClick={async () => toast((await copyText(f.value)) ? `${f.label} copied` : 'Copy failed')} aria-label={`Copy ${f.label}`}>Copy</button>
        </li>
      ))}
    </ul>
  );
}
