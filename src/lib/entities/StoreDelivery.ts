import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { User } from './User';

/** Entrega de un pedido en una tienda (antes StoreDelivery en Mongo). */
export class StoreDelivery {
  [OptionalProps]?: 'deliveredAt' | 'shipmentCreated' | 'createdAt';
  id: string = randomUUID();
  orderId!: string;
  orderDisplayId!: number;
  storeId!: string;
  storeName!: string;
  /** Nullable: una entrega hecha por el admin no tiene fila User asociada. */
  deliveredBy?: User;
  deliveredByName!: string;
  deliveredAt: Date = new Date();
  shipmentCreated: boolean = false;
  createdAt: Date = new Date();
}

Object.defineProperty(StoreDelivery, 'name', { value: 'StoreDelivery' });

export const StoreDeliverySchema = new EntitySchema<StoreDelivery>({
  class: StoreDelivery,
  name: 'StoreDelivery',
  tableName: 'store_deliveries',
  properties: {
    id: { type: 'uuid', primary: true },
    orderId: { type: 'string', index: true },
    orderDisplayId: { type: 'integer' },
    storeId: { type: 'string', index: true },
    storeName: { type: 'string' },
    deliveredBy: { kind: 'm:1', entity: () => 'User', nullable: true },
    deliveredByName: { type: 'string' },
    deliveredAt: { type: 'datetime', onCreate: () => new Date() },
    shipmentCreated: { type: 'boolean', default: false },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
  },
});
