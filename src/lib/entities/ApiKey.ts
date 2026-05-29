import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

/** API key para el dashboard externo (antes ApiKey en Mongo). */
export class ApiKey {
  [OptionalProps]?: 'active' | 'createdAt' | 'updatedAt';
  id: string = randomUUID();
  /** mk_xxxx... */
  key!: string;
  /** Nombre descriptivo (ej: "Dashboard externo"). */
  name!: string;
  active: boolean = true;
  lastUsedAt?: Date;
  createdByName!: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ApiKeySchema = new EntitySchema<ApiKey>({
  class: ApiKey,
  tableName: 'api_keys',
  properties: {
    id: { type: 'uuid', primary: true },
    key: { type: 'string', unique: true },
    name: { type: 'string' },
    active: { type: 'boolean', default: true },
    lastUsedAt: { type: 'datetime', nullable: true },
    createdByName: { type: 'string' },
    createdAt: { type: 'datetime', onCreate: () => new Date() },
    updatedAt: { type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
});
