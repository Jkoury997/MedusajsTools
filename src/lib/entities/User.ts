import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

export type UserRole = 'picker' | 'store' | 'admin';

/** Usuario del sistema de pickeo (antes PickingUser en Mongo). */
export class User {
  [OptionalProps]?: 'active' | 'role' | 'createdAt' | 'updatedAt';
  id: string = randomUUID();
  name!: string;
  /** PIN hasheado (HMAC; los heredados de Mongo son sha256, se migran en el login). */
  pin!: string;
  /** PIN cifrado (AES-GCM) para que el admin pueda verlo. Se completa al crear/editar o en el login. */
  pinEnc?: string;
  active: boolean = true;
  role: UserRole = 'picker';
  /** Solo para role=store: ID externo de la tienda (Medusa). */
  storeId?: string;
  /** Solo para role=store: nombre de la tienda. */
  storeName?: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

// Fijar el nombre de la clase para que sobreviva la minificación del bundler
// (si no, varias entidades colapsan al mismo nombre y MikroORM tira
// "Duplicate entity names"). Debe ir ANTES de construir el EntitySchema.
Object.defineProperty(User, 'name', { value: 'User' });

export const UserSchema = new EntitySchema<User>({
  class: User,
  name: 'User',
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string' },
    pin: { type: 'string' },
    pinEnc: { type: 'string', nullable: true },
    active: { type: 'boolean', default: true },
    role: { enum: true, items: ['picker', 'store', 'admin'], default: 'picker' },
    storeId: { type: 'string', nullable: true },
    storeName: { type: 'string', nullable: true },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
    updatedAt: { type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});
