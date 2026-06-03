// Entidades MikroORM del pickup-system (reemplazan los modelos Mongoose).
export { User, UserSchema } from './User';
export type { UserRole } from './User';
export {
  PickingSession,
  PickingSessionSchema,
  PickingItem,
  PickingItemSchema,
} from './PickingSession';
export type {
  PickingStatus,
  ScanMethod,
  FaltanteResolution,
  FulfillmentStatus,
} from './PickingSession';
export {
  PickingWave,
  PickingWaveSchema,
  PickingWaveOrder,
  PickingWaveOrderSchema,
  PickingWaveOrderItem,
  PickingWaveOrderItemSchema,
  PickingWaveLine,
  PickingWaveLineSchema,
} from './PickingWave';
export type { WaveStatus, WaveOrderStatus } from './PickingWave';
export { Store, StoreSchema } from './Store';
export { StoreDelivery, StoreDeliverySchema } from './StoreDelivery';
export { StoreShipment, StoreShipmentSchema } from './StoreShipment';
export { ApiKey, ApiKeySchema } from './ApiKey';
export { AuditLog, AuditLogSchema } from './AuditLog';
export type { AuditAction } from './AuditLog';

import { UserSchema } from './User';
import { PickingSessionSchema, PickingItemSchema } from './PickingSession';
import {
  PickingWaveSchema,
  PickingWaveOrderSchema,
  PickingWaveOrderItemSchema,
  PickingWaveLineSchema,
} from './PickingWave';
import { StoreSchema } from './Store';
import { StoreDeliverySchema } from './StoreDelivery';
import { StoreShipmentSchema } from './StoreShipment';
import { ApiKeySchema } from './ApiKey';
import { AuditLogSchema } from './AuditLog';

/** Lista de schemas para la config de MikroORM. */
export const entities = [
  UserSchema,
  PickingSessionSchema,
  PickingItemSchema,
  PickingWaveSchema,
  PickingWaveOrderSchema,
  PickingWaveOrderItemSchema,
  PickingWaveLineSchema,
  StoreSchema,
  StoreDeliverySchema,
  StoreShipmentSchema,
  ApiKeySchema,
  AuditLogSchema,
];
