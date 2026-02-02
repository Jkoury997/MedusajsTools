import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';

// ==================== PICKING USER ====================

export interface IPickingUser extends Document {
  name: string;
  pin: string; // hasheado
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PickingUserSchema = new Schema<IPickingUser>(
  {
    name: { type: String, required: true },
    pin: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
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
  | 'order_pack'
  | 'fulfillment_create'
  | 'fulfillment_error'
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'admin_login';

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
