export type PassKind = 'solo' | 'couple' | 'other';
export type Channel = 'whatsapp' | 'showmates' | 'cash' | 'other';

export interface Base { id: string; createdAt: number; updatedAt: number; deletedAt?: number }
export interface EventNight extends Base { date: string; name: string }
export interface PassType extends Base {
  name: string; kind: PassKind; seatsPerUnit: number; listPrice: number; price: number;
  aliases: string[]; sortOrder: number; active: boolean;
}
export interface Customer extends Base { phone: string; name: string; nameLower: string }
export interface SaleLine {
  passTypeId: string; nameSnap: string; seatsPerUnitSnap: number; listPriceSnap: number;
  unitPriceSnap: number; qty: number; punchedAt?: number;
}
export type PunchState = 'none' | 'partial' | 'done';
export interface Sale extends Base {
  refNo: string; eventId: string; customerId: string; lines: SaleLine[]; discount: number;
  total: number; seats: number; channel: Channel; punchState: PunchState; notes?: string;
  sourceText?: string; sourceHash?: string; cancelledAt?: number;
}
export interface Payment extends Base {
  saleId: string; kind: 'receipt' | 'refund'; amount: number; method: 'upi' | 'cash' | 'other';
  utr?: string; receiverId?: string; paidAt: number; note?: string;
}
export interface Receiver extends Base { name: string; nameLower: string }
export interface AuditRow { seq?: number; at: number; entity: string; entityId: string; action: string; before?: unknown; after?: unknown }
export interface Setting { key: string; value: unknown }
