import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

/** Envío de un pedido a una tienda (antes StoreShipment en Mongo). */
export class StoreShipment {
  [OptionalProps]?: 'storeId' | 'storeAddress' | 'shippedAt' | 'createdAt';
  id: string = randomUUID();
  orderId!: string;
  orderDisplayId!: number;
  storeId: string = '';
  storeName!: string;
  storeAddress: string = '';
  shippedByName!: string;
  shippedAt: Date = new Date();
  createdAt: Date = new Date();
}

export const StoreShipmentSchema = new EntitySchema<StoreShipment>({
  class: StoreShipment,
  tableName: 'store_shipments',
  properties: {
    id: { type: 'uuid', primary: true },
    orderId: { type: 'string', unique: true, index: true },
    orderDisplayId: { type: 'integer' },
    storeId: { type: 'string', default: '' },
    storeName: { type: 'string' },
    storeAddress: { type: 'string', default: '' },
    shippedByName: { type: 'string' },
    shippedAt: { type: 'datetime', onCreate: () => new Date() },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
  },
});
