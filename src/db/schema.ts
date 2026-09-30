import Dexie, { type Table } from 'dexie';
import type { Attachment, AuditRow, Customer, Expense, EventNight, PassType, Payment, Receiver, Sale, Setting } from '../domain/types';

export class DiviDB extends Dexie {
  events!: Table<EventNight, string>;
  passTypes!: Table<PassType, string>;
  customers!: Table<Customer, string>;
  sales!: Table<Sale, string>;
  payments!: Table<Payment, string>;
  receivers!: Table<Receiver, string>;
  auditLog!: Table<AuditRow, number>;
  expenses!: Table<Expense, string>;
  attachments!: Table<Attachment, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'divi-pass') {
    super(name);
    this.version(1).stores({
      events: 'id, date, updatedAt, deletedAt',
      passTypes: 'id, sortOrder, updatedAt, deletedAt',
      customers: 'id, phone, nameLower, updatedAt, deletedAt',
      sales: 'id, eventId, customerId, refNo, createdAt, updatedAt, deletedAt, cancelledAt, punchState, sourceHash, [eventId+punchState]',
      payments: 'id, saleId, utr, paidAt, receiverId, kind, updatedAt, deletedAt',
      receivers: 'id, nameLower, updatedAt, deletedAt',
      auditLog: '++seq, at, entity, entityId',
      settings: 'key',
    });
    this.version(2).stores({
      expenses: 'id, eventId, paidAt, updatedAt, deletedAt',
      attachments: 'id, paymentId, saleId, createdAt, deletedAt',
    });
  }
}

export const SYNC_TABLES = ['events', 'passTypes', 'customers', 'sales', 'payments', 'receivers', 'expenses'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export let db = new DiviDB();
/** Test hook: swap in an isolated database. */
export function useDatabase(next: DiviDB) { db = next; }
