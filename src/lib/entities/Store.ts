import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

/** Tienda oficial (antes Store en Mongo). */
export class Store {
  [OptionalProps]?: 'address' | 'active' | 'createdAt' | 'updatedAt';
  id: string = randomUUID();
  /** ID que viene de Medusa (data.store.id). */
  externalId!: string;
  name!: string;
  address: string = '';
  active: boolean = true;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

Object.defineProperty(Store, 'name', { value: 'Store' });

export const StoreSchema = new EntitySchema<Store>({
  class: Store,
  name: 'Store',
  tableName: 'stores',
  properties: {
    id: { type: 'uuid', primary: true },
    externalId: { type: 'string', unique: true },
    name: { type: 'string' },
    address: { type: 'string', default: '' },
    active: { type: 'boolean', default: true },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
    updatedAt: { type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});
