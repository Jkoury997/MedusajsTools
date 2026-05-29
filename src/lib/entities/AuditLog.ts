import { EntitySchema, OptionalProps } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { User } from './User';

export type AuditAction =
  | 'session_start'
  | 'session_complete'
  | 'session_cancel'
  | 'item_pick'
  | 'item_unpick'
  | 'item_missing'
  | 'order_pack'
  | 'fulfillment_create'
  | 'fulfillment_error'
  | 'order_ship'
  | 'order_ship_store'
  | 'order_deliver'
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'admin_login'
  | 'store_login'
  | 'login'
  | 'api_key_create'
  | 'api_key_revoke';

/** Registro de auditoría (antes AuditLog en Mongo). */
export class AuditLog {
  [OptionalProps]?: 'createdAt';
  id: string = randomUUID();
  action!: AuditAction;
  userName!: string;
  user?: User;
  orderId?: string;
  orderDisplayId?: number;
  details?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const AuditLogSchema = new EntitySchema<AuditLog>({
  class: AuditLog,
  tableName: 'audit_logs',
  properties: {
    id: { type: 'uuid', primary: true },
    action: { type: 'string', index: true },
    userName: { type: 'string' },
    user: { kind: 'm:1', entity: () => 'User', nullable: true, index: true },
    orderId: { type: 'string', nullable: true, index: true },
    orderDisplayId: { type: 'integer', nullable: true },
    details: { type: 'text', nullable: true },
    metadata: { type: 'json', nullable: true },
    createdAt: { type: 'datetime', onCreate: () => new Date(), index: true },
  },
});
