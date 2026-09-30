import { z } from 'zod';
import { db, SYNC_TABLES, type SyncTable } from './schema';
import { hashText } from '../parser';
import { setSetting } from './repo';

export const SCHEMA_VERSION = 1;
interface Row { id: string; updatedAt: number; [k: string]: unknown }

const FileSchema = z.object({
  app: z.literal('divi-pass'),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  exportedAt: z.number(),
  checksum: z.string(),
  tables: z.record(z.string(), z.array(z.object({ id: z.string(), updatedAt: z.number() }).passthrough())),
});
export type BackupFile = z.infer<typeof FileSchema>;

export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, Row[]> = {};
  for (const t of SYNC_TABLES) tables[t] = (await db.table(t).toArray()) as Row[];
  return { app: 'divi-pass', schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), checksum: hashText(JSON.stringify(tables)), tables };
}

export async function markBackedUp() {
  await setSetting('lastBackupAt', Date.now());
  await setSetting('salesSinceBackup', 0);
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('This is not a Divi Pass backup file'); }
  const r = FileSchema.safeParse(raw);
  if (!r.success) throw new Error('This is not a Divi Pass backup file');
  // hash the raw parsed tables: zod reorders keys, which would change the string
  if (hashText(JSON.stringify((raw as { tables: unknown }).tables)) !== r.data.checksum) throw new Error('Backup file is damaged (checksum mismatch)');
  return r.data;
}

export interface ImportPreview { added: number; updated: number; unchanged: number; older: number; byTable: Record<string, { added: number; updated: number }> }

export async function previewImport(file: BackupFile): Promise<ImportPreview> {
  const p: ImportPreview = { added: 0, updated: 0, unchanged: 0, older: 0, byTable: {} };
  for (const t of SYNC_TABLES) {
    const local = new Map((await db.table(t).toArray() as Row[]).map((r) => [r.id, r]));
    const s = (p.byTable[t] = { added: 0, updated: 0 });
    for (const r of file.tables[t] ?? []) {
      const l = local.get(r.id);
      if (!l) { p.added++; s.added++; }
      else if (r.updatedAt > l.updatedAt) { p.updated++; s.updated++; }
      else if (r.updatedAt === l.updatedAt) p.unchanged++;
      else p.older++;
    }
  }
  return p;
}

/** Merge by id; the newest updatedAt wins. One transaction so live screens refresh once. */
export async function applyImport(file: BackupFile) {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t as SyncTable)), db.auditLog] as never, async () => {
    for (const t of SYNC_TABLES) {
      const tbl = db.table(t);
      const local = new Map((await tbl.toArray() as Row[]).map((r) => [r.id, r]));
      const incoming = (file.tables[t] ?? []).filter((r) => { const l = local.get(r.id); return !l || r.updatedAt > l.updatedAt; });
      if (incoming.length) await tbl.bulkPut(incoming);
    }
    await db.auditLog.add({ at: Date.now(), entity: 'backup', entityId: file.checksum, action: 'import' });
  });
}
