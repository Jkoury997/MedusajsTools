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

// ==================== HELPERS ====================

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// ==================== MODELOS ====================

// Evitar re-definir modelos en hot reload de Next.js
export const PickingUser: Model<IPickingUser> =
  mongoose.models.PickingUser || mongoose.model<IPickingUser>('PickingUser', PickingUserSchema);

export const PickingSession: Model<IPickingSession> =
  mongoose.models.PickingSession || mongoose.model<IPickingSession>('PickingSession', PickingSessionSchema);
