import { EntitySchema, Collection, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { User } from './User';

export type PickingStatus = 'in_progress' | 'completed' | 'cancelled';
export type ScanMethod = 'barcode' | 'manual' | 'sku';
export type FaltanteResolution = 'pending' | 'voucher' | 'waiting' | 'resolved';
/** Estado del fulfillment en Medusa (para soportar reintentos sin duplicar). */
export type FulfillmentStatus = 'none' | 'pending' | 'created' | 'failed';

/** Ítem de una sesión de picking (antes embebido en el array `items` de Mongo). */
export class PickingItem {
  [OptionalProps]?: 'quantityPicked' | 'quantityMissing' | 'quantityReceived';
  id: string = randomUUID();
  session!: PickingSession;
  lineItemId!: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  quantityRequired!: number;
  quantityPicked: number = 0;
  quantityMissing: number = 0;
  quantityReceived: number = 0;
  pickedAt?: Date;
  scanMethod?: ScanMethod;
}

/** Sesión de pickeo de una orden (antes PickingSession en Mongo). */
export class PickingSession {
  [OptionalProps]?:
    | 'status'
    | 'startedAt'
    | 'packed'
    | 'totalRequired'
    | 'totalPicked'
    | 'totalMissing'
    | 'fulfillmentStatus'
    | 'createdAt'
    | 'updatedAt';
  id: string = randomUUID();
  orderId!: string;
  orderDisplayId!: number;
  status: PickingStatus = 'in_progress';
  items = new Collection<PickingItem>(this);
  // Tiempos
  startedAt: Date = new Date();
  completedAt?: Date;
  durationSeconds?: number;
  // Empaque
  packed: boolean = false;
  packedAt?: Date;
  packedByName?: string;
  // Cancelación
  cancelReason?: string;
  cancelledAt?: Date;
  // Usuario
  user!: User;
  userName!: string;
  completedByName?: string;
  // Totales
  totalRequired: number = 0;
  totalPicked: number = 0;
  totalMissing: number = 0;
  // Resolución de faltantes
  faltanteResolution?: FaltanteResolution;
  faltanteResolvedAt?: Date;
  faltanteNotes?: string;
  // Voucher estructurado (reemplaza el parseo de faltanteNotes con regex)
  voucherCode?: string;
  voucherValue?: number;
  // Estado de fulfillment en Medusa (Fase 3: reintentos idempotentes)
  fulfillmentStatus: FulfillmentStatus = 'none';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

// Fijar nombres de clase para que sobrevivan la minificación (ver User.ts).
Object.defineProperty(PickingItem, 'name', { value: 'PickingItem' });
Object.defineProperty(PickingSession, 'name', { value: 'PickingSession' });

export const PickingItemSchema = new EntitySchema<PickingItem>({
  class: PickingItem,
  name: 'PickingItem',
  tableName: 'picking_items',
  properties: {
    id: { type: 'uuid', primary: true },
    session: { kind: 'm:1', entity: () => 'PickingSession', inversedBy: 'items', deleteRule: 'cascade' },
    lineItemId: { type: 'string' },
    variantId: { type: 'string', nullable: true },
    sku: { type: 'string', nullable: true },
    barcode: { type: 'string', nullable: true },
    quantityRequired: { type: 'integer' },
    quantityPicked: { type: 'integer', default: 0 },
    quantityMissing: { type: 'integer', default: 0 },
    quantityReceived: { type: 'integer', default: 0 },
    pickedAt: { type: 'datetime', nullable: true },
    scanMethod: { enum: true, items: ['barcode', 'manual', 'sku'], nullable: true },
  },
});

export const PickingSessionSchema = new EntitySchema<PickingSession>({
  class: PickingSession,
  name: 'PickingSession',
  tableName: 'picking_sessions',
  properties: {
    id: { type: 'uuid', primary: true },
    orderId: { type: 'string', index: true },
    orderDisplayId: { type: 'integer' },
    status: { enum: true, items: ['in_progress', 'completed', 'cancelled'], default: 'in_progress', index: true },
    items: { kind: '1:m', entity: () => 'PickingItem', mappedBy: 'session', orphanRemoval: true },
    startedAt: { type: 'datetime', onCreate: () => new Date() },
    completedAt: { type: 'datetime', nullable: true },
    durationSeconds: { type: 'integer', nullable: true },
    packed: { type: 'boolean', default: false },
    packedAt: { type: 'datetime', nullable: true },
    packedByName: { type: 'string', nullable: true },
    cancelReason: { type: 'string', nullable: true },
    cancelledAt: { type: 'datetime', nullable: true },
    user: { kind: 'm:1', entity: () => 'User', index: true },
    userName: { type: 'string' },
    completedByName: { type: 'string', nullable: true },
    totalRequired: { type: 'integer', default: 0 },
    totalPicked: { type: 'integer', default: 0 },
    totalMissing: { type: 'integer', default: 0 },
    faltanteResolution: { enum: true, items: ['pending', 'voucher', 'waiting', 'resolved'], nullable: true },
    faltanteResolvedAt: { type: 'datetime', nullable: true },
    faltanteNotes: { type: 'text', nullable: true },
    voucherCode: { type: 'string', nullable: true },
    voucherValue: { type: 'integer', nullable: true },
    fulfillmentStatus: { enum: true, items: ['none', 'pending', 'created', 'failed'], default: 'none' },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
    updatedAt: { type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});
