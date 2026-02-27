import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';

// ==================== PICKING USER ====================

export interface IPickingUser extends Document {
  name: string;
  pin: string; // hasheado
  active: boolean;
  role: 'picker' | 'store';
  storeId?: string;   // ID de la tienda (solo para role=store)
  storeName?: string;  // Nombre de la tienda (solo para role=store)
  createdAt: Date;
  updatedAt: Date;
}

const PickingUserSchema = new Schema<IPickingUser>(
  {
    name: { type: String, required: true },
    pin: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    role: { type: String, enum: ['picker', 'store'], default: 'picker' },
    storeId: { type: String },
    storeName: { type: String },
  },
  { timestamps: true }
);

// ==================== PICKING SESSION ====================

export interface IPickingItem {
  lineItemId: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  quantityRequired: number;
  quantityPicked: number;
  quantityMissing?: number;
  quantityReceived?: number; // Cantidad recibida de faltantes
  pickedAt?: Date;
  scanMethod?: 'barcode' | 'manual' | 'sku';
}

export interface IPickingSession extends Document {
  orderId: string;
  orderDisplayId: number;
  status: 'in_progress' | 'completed' | 'cancelled';
  items: IPickingItem[];
  // Tiempos
  startedAt: Date;
  completedAt?: Date;
  durationSeconds?: number;
  // Empaque
  packed: boolean;
  packedAt?: Date;
  packedByName?: string;
  // Cancelación
  cancelReason?: string;
  cancelledAt?: Date;
  // Usuario
  userId: mongoose.Types.ObjectId;
  userName: string;
  completedByName?: string;
  // Totales
  totalRequired: number;
  totalPicked: number;
  totalMissing: number;
  // Resolución de faltantes
  faltanteResolution?: 'pending' | 'voucher' | 'waiting' | 'resolved' | null;
  faltanteResolvedAt?: Date;
  faltanteNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PickingItemSchema = new Schema<IPickingItem>(
  {
    lineItemId: { type: String, required: true },
    variantId: { type: String },
    sku: { type: String },
    barcode: { type: String },
    quantityRequired: { type: Number, required: true },
    quantityPicked: { type: Number, default: 0 },
    quantityMissing: { type: Number, default: 0 },
    quantityReceived: { type: Number, default: 0 },
    pickedAt: { type: Date },
    scanMethod: { type: String, enum: ['barcode', 'manual', 'sku'] },
  },
  { _id: true }
);

const PickingSessionSchema = new Schema<IPickingSession>(
  {
    orderId: { type: String, required: true, index: true },
    orderDisplayId: { type: Number, required: true },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'cancelled'],
      default: 'in_progress',
      index: true,
    },
    items: [PickingItemSchema],
    // Tiempos
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    durationSeconds: { type: Number },
    // Empaque
    packed: { type: Boolean, default: false },
    packedAt: { type: Date },
    packedByName: { type: String },
    // Cancelación
    cancelReason: { type: String },
    cancelledAt: { type: Date },
    // Usuario
    userId: { type: Schema.Types.ObjectId, ref: 'PickingUser', required: true, index: true },
    userName: { type: String, required: true },
    completedByName: { type: String },
    // Totales
    totalRequired: { type: Number, default: 0 },
    totalPicked: { type: Number, default: 0 },
    totalMissing: { type: Number, default: 0 },
    // Resolución de faltantes
    faltanteResolution: { type: String, enum: ['pending', 'voucher', 'waiting', 'resolved', null], default: null },
    faltanteResolvedAt: { type: Date },
    faltanteNotes: { type: String },
  },
  { timestamps: true }
);

// ==================== STORE (Tiendas) ====================

export interface IStore extends Document {
  externalId: string;  // ID que viene de Medusa (data.store.id)
  name: string;
  address: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema = new Schema<IStore>(
  {
    externalId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    address: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ==================== STORE DELIVERY ====================

export interface IStoreDelivery extends Document {
  orderId: string;
  orderDisplayId: number;
  storeId: string;
  storeName: string;
  deliveredByUserId: mongoose.Types.ObjectId;
  deliveredByName: string;
  deliveredAt: Date;
  shipmentCreated: boolean;
  createdAt: Date;
}

const StoreDeliverySchema = new Schema<IStoreDelivery>(
  {
    orderId: { type: String, required: true, index: true },
    orderDisplayId: { type: Number, required: true },
    storeId: { type: String, required: true, index: true },
    storeName: { type: String, required: true },
    deliveredByUserId: { type: Schema.Types.ObjectId, ref: 'PickingUser', required: true },
    deliveredByName: { type: String, required: true },
    deliveredAt: { type: Date, default: Date.now },
    shipmentCreated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ==================== API KEY ====================

export interface IApiKey extends Document {
  key: string;          // mk_xxxx...
  name: string;         // Nombre descriptivo (ej: "Dashboard externo")
  active: boolean;
  lastUsedAt?: Date;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    createdByName: { type: String, required: true },
  },
  { timestamps: true }
);

// ==================== AUDIT LOG ====================

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
  | 'order_deliver'
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'admin_login'
  | 'store_login'
  | 'login'
  | 'api_key_create'
  | 'api_key_revoke';

export interface IAuditLog extends Document {
  action: AuditAction;
  userName: string;
  userId?: mongoose.Types.ObjectId;
  orderId?: string;
  orderDisplayId?: number;
  details?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'PickingUser', index: true },
    orderId: { type: String, index: true },
    orderDisplayId: { type: Number },
    details: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Index compuesto para consultas por fecha
AuditLogSchema.index({ createdAt: -1 });

// ==================== HELPERS ====================

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/** Registrar acción en el log de auditoría (fire-and-forget) */
export function audit(data: {
  action: AuditAction;
  userName: string;
  userId?: string;
  orderId?: string;
  orderDisplayId?: number;
  details?: string;
  metadata?: Record<string, unknown>;
}): void {
  // Fire-and-forget — no bloquea la respuesta
  AuditLog.create({
    action: data.action,
    userName: data.userName,
    userId: data.userId || undefined,
    orderId: data.orderId,
    orderDisplayId: data.orderDisplayId,
    details: data.details,
    metadata: data.metadata,
  }).catch(err => console.error('[Audit] Error:', err.message));
}

// ==================== MODELOS ====================

// Evitar re-definir modelos en hot reload de Next.js
export const PickingUser: Model<IPickingUser> =
  mongoose.models.PickingUser || mongoose.model<IPickingUser>('PickingUser', PickingUserSchema);

export const PickingSession: Model<IPickingSession> =
  mongoose.models.PickingSession || mongoose.model<IPickingSession>('PickingSession', PickingSessionSchema);

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export const StoreDelivery: Model<IStoreDelivery> =
  mongoose.models.StoreDelivery || mongoose.model<IStoreDelivery>('StoreDelivery', StoreDeliverySchema);

export const Store: Model<IStore> =
  mongoose.models.Store || mongoose.model<IStore>('Store', StoreSchema);

export const ApiKey: Model<IApiKey> =
  mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
