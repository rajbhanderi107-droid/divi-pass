export type PassKind = 'solo' | 'couple' | 'other';
export type Channel = 'whatsapp' | 'showmates' | 'cash' | 'other';

export interface Base { id: string; createdAt: number; updatedAt: number; deletedAt?: number }
export interface EventNight extends Base { date: string; name: string; prices?: Record<string, number> }
export interface PassType extends Base {
  name: string; kind: PassKind; seatsPerUnit: number; listPrice: number; price: number;
  aliases: string[]; sortOrder: number; active: boolean; showmatesName?: string;
}
export interface Customer extends Base { phone: string; name: string; nameLower: string }
export interface SaleLine {
  passTypeId: string; nameSnap: string; seatsPerUnitSnap: number; listPriceSnap: number;
  unitPriceSnap: number; qty: number; punchedAt?: number; ticketSnap?: string;
}
export type PunchState = 'none' | 'partial' | 'done';
export interface Sale extends Base {
  refNo: string; eventId: string; customerId: string; lines: SaleLine[]; discount: number;
  total: number; seats: number; channel: Channel; punchState: PunchState; notes?: string;
  sourceText?: string; sourceHash?: string; cancelledAt?: number; entered?: number; sellerId?: string; needsCheck?: string[];
}
export interface Payment extends Base {
  saleId: string; kind: 'receipt' | 'refund'; amount: number; method: 'upi' | 'cash' | 'other';
  utr?: string; receiverId?: string; paidAt: number; note?: string; attachmentId?: string;
}
export interface Receiver extends Base { name: string; nameLower: string; agentOf?: string }
export interface AuditRow { seq?: number; at: number; entity: string; entityId: string; action: string; before?: unknown; after?: unknown }
export interface Setting { key: string; value: unknown }
export interface Expense extends Base { eventId: string; label: string; amount: number; paidAt: number; receiverId?: string }
export interface Attachment { id: string; paymentId: string; saleId: string; mime: string; bytes: number; blob: Blob; createdAt: number; deletedAt?: number }
export interface InboxItem { id: string; text: string; reason: string; createdAt: number; deletedAt?: number }
