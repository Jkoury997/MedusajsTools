import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

export type UserRole = 'picker' | 'store' | 'admin';

/** Usuario del sistema de pickeo (antes PickingUser en Mongo). */
export class User {
  [OptionalProps]?: 'active' | 'role' | 'createdAt' | 'updatedAt';
  id: string = randomUUID();
  name!: string;
  /** PIN hasheado (bcrypt; los heredados de Mongo son sha256, se migran en el login). */
  pin!: string;
  active: boolean = true;
  role: UserRole = 'picker';
  /** Solo para role=store: ID externo de la tienda (Medusa). */
  storeId?: string;
  /** Solo para role=store: nombre de la tienda. */
  storeName?: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const UserSchema = new EntitySchema<User>({
  class: User,
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string' },
    pin: { type: 'string' },
    active: { type: 'boolean', default: true },
    role: { enum: true, items: ['picker', 'store', 'admin'], default: 'picker' },
    storeId: { type: 'string', nullable: true },
    storeName: { type: 'string', nullable: true },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
    updatedAt: { type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});
