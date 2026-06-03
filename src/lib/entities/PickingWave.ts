import { EntitySchema, Collection, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

/** Estado de una ola (batch) de picking. */
export type WaveStatus =
  | 'draft'      // armada, sin empezar a recolectar
  | 'picking'    // recolección consolidada por SKU en curso
  | 'sorting'    // clasificación en la mesa (put-to-wall)
  | 'ready'      // todos los pedidos clasificados, listos para enviar
  | 'completed'  // despachada
  | 'cancelled';

/** Estado de un pedido dentro de la ola (una letra de la mesa). */
export type WaveOrderStatus = 'pending' | 'sorting' | 'ready';

/**
 * Ola (batch) de picking: agrupa hasta 8 pedidos para recolectarlos juntos
 * (consolidado por SKU) y clasificarlos después en la mesa (put-to-wall).
 * Convive con el flujo individual (`PickingSession`), no lo reemplaza.
 */
export class PickingWave {
  [OptionalProps]?:
    | 'status'
    | 'createdAt'
    | 'updatedAt';
  id: string = randomUUID();
  /** Número correlativo legible (p. ej. "Ola #12"). */
  displayNumber!: number;
  storeId!: string;
  /** Mesa que procesa la ola: "mesa-1" | "mesa-2". */
  stationId!: string;
  status: WaveStatus = 'draft';
  // Quién la creó (string para no acoplar con la existencia del User).
  createdByUserId?: string;
  createdByName!: string;
  // Relaciones
  orders = new Collection<PickingWaveOrder>(this);
  lines = new Collection<PickingWaveLine>(this);
  // Tiempos del ciclo de vida
  createdAt: Date = new Date();
  pickingStartedAt?: Date;
  sortingStartedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  updatedAt: Date = new Date();
}

/** Un pedido dentro de la ola: ocupa una letra (A–H) de la mesa. */
export class PickingWaveOrder {
  [OptionalProps]?: 'status';
  id: string = randomUUID();
  wave!: PickingWave;
  orderId!: string;
  orderDisplayId!: number;
  /** Posición física en la mesa: "A".."H". */
  letter!: string;
  /** Prioridad para repartir faltantes: menor = más prioritario (más antiguo). */
  priority!: number;
  status: WaveOrderStatus = 'pending';
  readyAt?: Date;
  items = new Collection<PickingWaveOrderItem>(this);
}

/** Lo que necesita cada pedido: destino del sorting en la mesa. */
export class PickingWaveOrderItem {
  [OptionalProps]?: 'quantitySorted' | 'quantityMissing';
  id: string = randomUUID();
  waveOrder!: PickingWaveOrder;
  lineItemId!: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  quantityRequired!: number;
  /** Cuánto se clasificó a esta letra. */
  quantitySorted: number = 0;
  /** Faltante final asignado a este pedido (se calcula al cerrar el sorting). */
  quantityMissing: number = 0;
}

/** Vista consolidada por SKU para la recolección (una sola pasada). */
export class PickingWaveLine {
  [OptionalProps]?: 'quantityPicked' | 'quantityShort';
  id: string = randomUUID();
  wave!: PickingWave;
  variantId?: string;
  sku?: string;
  barcode?: string;
  title?: string;
  /** Suma de lo requerido por todos los pedidos para este SKU. */
  quantityRequired!: number;
  /** Lo que el picker juntó en la recorrida. */
  quantityPicked: number = 0;
  /** Faltante de la recolección (= requerido - pickeado) al cerrar el picking. */
  quantityShort: number = 0;
}

// Fijar nombres de clase para que sobrevivan la minificación (ver User.ts).
Object.defineProperty(PickingWave, 'name', { value: 'PickingWave' });
Object.defineProperty(PickingWaveOrder, 'name', { value: 'PickingWaveOrder' });
Object.defineProperty(PickingWaveOrderItem, 'name', { value: 'PickingWaveOrderItem' });
Object.defineProperty(PickingWaveLine, 'name', { value: 'PickingWaveLine' });

export const PickingWaveSchema = new EntitySchema<PickingWave>({
  class: PickingWave,
  name: 'PickingWave',
  tableName: 'picking_waves',
  properties: {
    id: { type: 'uuid', primary: true },
    displayNumber: { type: 'integer' },
    storeId: { type: 'string', index: true },
    stationId: { type: 'string', index: true },
    status: {
      enum: true,
      items: ['draft', 'picking', 'sorting', 'ready', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    createdByUserId: { type: 'string', nullable: true },
    createdByName: { type: 'string' },
    orders: { kind: '1:m', entity: () => 'PickingWaveOrder', mappedBy: 'wave', orphanRemoval: true },
    lines: { kind: '1:m', entity: () => 'PickingWaveLine', mappedBy: 'wave', orphanRemoval: true },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
    pickingStartedAt: { type: 'datetime', nullable: true },
    sortingStartedAt: { type: 'datetime', nullable: true },
    completedAt: { type: 'datetime', nullable: true },
    cancelledAt: { type: 'datetime', nullable: true },
    cancelReason: { type: 'text', nullable: true },
    updatedAt: { type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});

export const PickingWaveOrderSchema = new EntitySchema<PickingWaveOrder>({
  class: PickingWaveOrder,
  name: 'PickingWaveOrder',
  tableName: 'picking_wave_orders',
  properties: {
    id: { type: 'uuid', primary: true },
    wave: { kind: 'm:1', entity: () => 'PickingWave', inversedBy: 'orders', deleteRule: 'cascade', index: true },
    orderId: { type: 'string', index: true },
    orderDisplayId: { type: 'integer' },
    letter: { type: 'string' },
    priority: { type: 'integer' },
    status: { enum: true, items: ['pending', 'sorting', 'ready'], default: 'pending', index: true },
    readyAt: { type: 'datetime', nullable: true },
    items: { kind: '1:m', entity: () => 'PickingWaveOrderItem', mappedBy: 'waveOrder', orphanRemoval: true },
  },
});

export const PickingWaveOrderItemSchema = new EntitySchema<PickingWaveOrderItem>({
  class: PickingWaveOrderItem,
  name: 'PickingWaveOrderItem',
  tableName: 'picking_wave_order_items',
  properties: {
    id: { type: 'uuid', primary: true },
    waveOrder: { kind: 'm:1', entity: () => 'PickingWaveOrder', inversedBy: 'items', deleteRule: 'cascade', index: true },
    lineItemId: { type: 'string' },
    variantId: { type: 'string', nullable: true },
    sku: { type: 'string', nullable: true },
    barcode: { type: 'string', nullable: true },
    quantityRequired: { type: 'integer' },
    quantitySorted: { type: 'integer', default: 0 },
    quantityMissing: { type: 'integer', default: 0 },
  },
});

export const PickingWaveLineSchema = new EntitySchema<PickingWaveLine>({
  class: PickingWaveLine,
  name: 'PickingWaveLine',
  tableName: 'picking_wave_lines',
  properties: {
    id: { type: 'uuid', primary: true },
    wave: { kind: 'm:1', entity: () => 'PickingWave', inversedBy: 'lines', deleteRule: 'cascade', index: true },
    variantId: { type: 'string', nullable: true },
    sku: { type: 'string', nullable: true },
    barcode: { type: 'string', nullable: true },
    title: { type: 'string', nullable: true },
    quantityRequired: { type: 'integer' },
    quantityPicked: { type: 'integer', default: 0 },
    quantityShort: { type: 'integer', default: 0 },
  },
});
