/**
 * Migra TODOS los datos de MongoDB a PostgreSQL.
 *
 * Uso (de noche, con la DB de Mongo todavía accesible):
 *   MONGODB_URI=mongodb+srv://...  DATABASE_URL=postgres://...  npx tsx scripts/migrate-mongo-to-pg.ts
 *
 * - Idempotente: vacía las tablas de Postgres antes de insertar.
 * - Mapea ObjectId -> uuid manteniendo un diccionario para resolver las FKs.
 * - Conserva los PIN tal cual (hash legacy sha256); verifyPin los soporta y se
 *   re-hashean a bcrypt en el primer login.
 *
 * IMPORTANTE: correr `npx tsx scripts/setup-db.ts` primero para crear el schema.
 */
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { buildOrmOptions } from '../src/lib/db';
import {
  User,
  Store,
  PickingSession,
  PickingItem,
  StoreDelivery,
  StoreShipment,
  ApiKey,
  AuditLog,
} from '../src/lib/entities';

type AnyDoc = Record<string, any>;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('Falta MONGODB_URI');

function oid(v: any): string | undefined {
  if (!v) return undefined;
  return typeof v === 'string' ? v : v.toString();
}

async function readCollection(name: string): Promise<AnyDoc[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongo no conectado');
  return db.collection(name).find({}).toArray();
}

async function main() {
  await mongoose.connect(MONGODB_URI as string);
  console.log('[migrate] Conectado a Mongo');

  const orm = await MikroORM.init(buildOrmOptions());
  const em = orm.em.fork();
  console.log('[migrate] Conectado a Postgres');

  // Vaciar Postgres (idempotencia). Orden: hijos antes que padres.
  for (const E of [AuditLog, StoreDelivery, StoreShipment, ApiKey, PickingItem, PickingSession, Store, User]) {
    await em.nativeDelete(E, {});
  }
  await em.flush();
  console.log('[migrate] Tablas de Postgres vaciadas');

  // Diccionario ObjectId(hex) -> uuid para resolver FKs.
  const userIdMap = new Map<string, string>();

  // ---- Usuarios ----
  const users = await readCollection('pickingusers');
  for (const d of users) {
    const id = randomUUID();
    userIdMap.set(oid(d._id)!, id);
    em.create(User, {
      id,
      name: d.name,
      pin: d.pin,
      active: d.active ?? true,
      role: d.role ?? 'picker',
      storeId: d.storeId,
      storeName: d.storeName,
      createdAt: d.createdAt ?? new Date(),
      updatedAt: d.updatedAt ?? new Date(),
    });
  }
  await em.flush();
  console.log(`[migrate] Usuarios: ${users.length}`);

  // ---- Tiendas ----
  const stores = await readCollection('stores');
  for (const d of stores) {
    em.create(Store, {
      id: randomUUID(),
      externalId: d.externalId,
      name: d.name,
      address: d.address ?? '',
      active: d.active ?? true,
      createdAt: d.createdAt ?? new Date(),
      updatedAt: d.updatedAt ?? new Date(),
    });
  }
  await em.flush();
  console.log(`[migrate] Tiendas: ${stores.length}`);

  // ---- Sesiones de picking (+ items) ----
  const sessions = await readCollection('pickingsessions');
  let itemCount = 0;
  for (const d of sessions) {
    const userId = userIdMap.get(oid(d.userId)!);
    if (!userId) {
      console.warn(`[migrate] sesión ${oid(d._id)} sin usuario mapeado, se omite`);
      continue;
    }
    const session = em.create(PickingSession, {
      id: randomUUID(),
      orderId: d.orderId,
      orderDisplayId: d.orderDisplayId,
      status: d.status ?? 'in_progress',
      startedAt: d.startedAt ?? d.createdAt ?? new Date(),
      completedAt: d.completedAt,
      durationSeconds: d.durationSeconds,
      packed: d.packed ?? false,
      packedAt: d.packedAt,
      packedByName: d.packedByName,
      cancelReason: d.cancelReason,
      cancelledAt: d.cancelledAt,
      user: em.getReference(User, userId),
      userName: d.userName,
      completedByName: d.completedByName,
      totalRequired: d.totalRequired ?? 0,
      totalPicked: d.totalPicked ?? 0,
      totalMissing: d.totalMissing ?? 0,
      faltanteResolution: d.faltanteResolution ?? undefined,
      faltanteResolvedAt: d.faltanteResolvedAt,
      faltanteNotes: d.faltanteNotes,
      fulfillmentStatus: 'none',
      createdAt: d.createdAt ?? new Date(),
      updatedAt: d.updatedAt ?? new Date(),
    });
    for (const it of d.items ?? []) {
      em.create(PickingItem, {
        id: randomUUID(),
        session,
        lineItemId: it.lineItemId,
        variantId: it.variantId,
        sku: it.sku,
        barcode: it.barcode,
        quantityRequired: it.quantityRequired,
        quantityPicked: it.quantityPicked ?? 0,
        quantityMissing: it.quantityMissing ?? 0,
        quantityReceived: it.quantityReceived ?? 0,
        pickedAt: it.pickedAt,
        scanMethod: it.scanMethod,
      });
      itemCount++;
    }
  }
  await em.flush();
  console.log(`[migrate] Sesiones: ${sessions.length}, items: ${itemCount}`);

  // ---- Entregas en tienda ----
  const deliveries = await readCollection('storedeliveries');
  for (const d of deliveries) {
    const userId = userIdMap.get(oid(d.deliveredByUserId)!);
    if (!userId) continue;
    em.create(StoreDelivery, {
      id: randomUUID(),
      orderId: d.orderId,
      orderDisplayId: d.orderDisplayId,
      storeId: d.storeId,
      storeName: d.storeName,
      deliveredBy: em.getReference(User, userId),
      deliveredByName: d.deliveredByName,
      deliveredAt: d.deliveredAt ?? new Date(),
      shipmentCreated: d.shipmentCreated ?? false,
      createdAt: d.createdAt ?? new Date(),
    });
  }
  await em.flush();
  console.log(`[migrate] Entregas: ${deliveries.length}`);

  // ---- Envíos a tienda ----
  const shipments = await readCollection('storeshipments');
  for (const d of shipments) {
    em.create(StoreShipment, {
      id: randomUUID(),
      orderId: d.orderId,
      orderDisplayId: d.orderDisplayId,
      storeId: d.storeId ?? '',
      storeName: d.storeName,
      storeAddress: d.storeAddress ?? '',
      shippedByName: d.shippedByName,
      shippedAt: d.shippedAt ?? new Date(),
      createdAt: d.createdAt ?? new Date(),
    });
  }
  await em.flush();
  console.log(`[migrate] Envíos: ${shipments.length}`);

  // ---- API keys ----
  const apiKeys = await readCollection('apikeys');
  for (const d of apiKeys) {
    em.create(ApiKey, {
      id: randomUUID(),
      key: d.key,
      name: d.name,
      active: d.active ?? true,
      lastUsedAt: d.lastUsedAt,
      createdByName: d.createdByName,
      createdAt: d.createdAt ?? new Date(),
      updatedAt: d.updatedAt ?? new Date(),
    });
  }
  await em.flush();
  console.log(`[migrate] API keys: ${apiKeys.length}`);

  // ---- Audit logs ----
  const logs = await readCollection('auditlogs');
  for (const d of logs) {
    const userId = d.userId ? userIdMap.get(oid(d.userId)!) : undefined;
    em.create(AuditLog, {
      id: randomUUID(),
      action: d.action,
      userName: d.userName,
      user: userId ? em.getReference(User, userId) : undefined,
      orderId: d.orderId,
      orderDisplayId: d.orderDisplayId,
      details: d.details,
      metadata: d.metadata,
      createdAt: d.createdAt ?? new Date(),
    });
  }
  await em.flush();
  console.log(`[migrate] Audit logs: ${logs.length}`);

  await orm.close(true);
  await mongoose.disconnect();
  console.log('[migrate] ✅ Migración completa');
}

main().catch((err) => {
  console.error('[migrate] ❌ Error:', err);
  process.exit(1);
});
