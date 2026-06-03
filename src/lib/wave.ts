/**
 * Helpers del picking por olas (batch). Una ola agrupa hasta 8 pedidos de retiro
 * en tienda para recolectarlos juntos (consolidado por SKU) y clasificarlos
 * después en la mesa (put-to-wall). Convive con el flujo individual.
 */
import { getPaidOrders } from './medusa';
import { isStorePickup } from './shipping';
import { HttpError } from './http';
import type { Session } from './session';
import type { EntityManager } from '@mikro-orm/postgresql';
import { User, PickingWave } from './entities';

/** Mesas físicas de clasificación disponibles (put-to-wall). */
export const STATIONS = ['mesa-1', 'mesa-2'] as const;
export type StationId = (typeof STATIONS)[number];

/** Letras de la mesa (8 posiciones). Una por pedido. */
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const MAX_ORDERS_PER_WAVE = LETTERS.length;

export function isValidStation(id: string): id is StationId {
  return (STATIONS as readonly string[]).includes(id);
}

/**
 * Resuelve qué tienda puede operar el actor. Mismas reglas que store-orders:
 * un no-admin solo su tienda; admin (o login admin) cualquiera vía query.
 */
export async function resolveStoreId(
  em: EntityManager,
  session: Session,
  requestedStoreId: string | null
): Promise<string> {
  const isAdmin = session.role === 'admin' || session.userId === 'admin';
  if (isAdmin) {
    if (!requestedStoreId) throw new HttpError(400, 'storeId es requerido');
    return requestedStoreId;
  }
  const actor = await em.findOne(User, { id: session.userId });
  const storeId = actor?.storeId;
  if (!storeId) throw new HttpError(403, 'El usuario no tiene tienda asignada');
  // Un no-admin no puede pedir otra tienda distinta a la suya.
  if (requestedStoreId && requestedStoreId !== storeId) {
    throw new HttpError(403, 'No autorizado para esa tienda');
  }
  return storeId;
}

/** Forma mínima de un ítem de pedido de Medusa que usamos para consolidar. */
interface OrderItemLike {
  id: string;
  quantity: number;
  product_title?: string;
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variant?: any;
}

/** Forma mínima de un pedido de Medusa que usamos para la ola. */
export interface WaveOrderSource {
  id: string;
  display_id: number;
  created_at: string;
  items: OrderItemLike[];
}

/**
 * Trae los pedidos de retiro en tienda en estado "para enviar" (fulfilled)
 * de una tienda, ordenados del más antiguo al más nuevo (prioridad de la ola).
 */
export async function getPendingStorePickupOrders(storeId: string): Promise<WaveOrderSource[]> {
  const fulfilled = await getPaidOrders(200, 0, 'enviar');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = fulfilled.orders.filter((order: any) => {
    const method = order.shipping_methods?.[0];
    if (!method || !isStorePickup(method.name)) return false;
    const store = method.data?.store;
    return store?.id === storeId;
  });

  // Más antiguos primero = mayor prioridad.
  orders.sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return orders as WaveOrderSource[];
}

/** Clave de consolidación: variante > sku > barcode > lineItem. */
function consolidationKey(item: OrderItemLike): string {
  return (
    item.variant?.id ||
    item.variant?.sku ||
    item.variant?.barcode ||
    `line:${item.id}`
  );
}

function itemTitle(item: OrderItemLike): string {
  return (
    item.variant?.product?.title ||
    item.product_title ||
    item.title ||
    item.variant?.title ||
    'Producto'
  );
}

export interface ConsolidatedLine {
  key: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  title: string;
  quantityRequired: number;
}

export interface PerOrderItem {
  lineItemId: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  title: string;
  quantityRequired: number;
}

export interface OrderBreakdown {
  orderId: string;
  orderDisplayId: number;
  createdAt: string;
  items: PerOrderItem[];
}

/**
 * Consolida los pedidos por SKU para la recolección y arma además el desglose
 * por pedido (destino del sorting). `orders` ya viene ordenado por prioridad.
 */
export function consolidate(orders: WaveOrderSource[]): {
  lines: ConsolidatedLine[];
  breakdown: OrderBreakdown[];
} {
  const lineMap = new Map<string, ConsolidatedLine>();
  const breakdown: OrderBreakdown[] = [];

  for (const order of orders) {
    const perOrder: PerOrderItem[] = [];
    for (const item of order.items || []) {
      const key = consolidationKey(item);
      const variantId = item.variant?.id;
      const sku = item.variant?.sku;
      const barcode = item.variant?.barcode;
      const title = itemTitle(item);

      perOrder.push({
        lineItemId: item.id,
        variantId,
        sku,
        barcode,
        title,
        quantityRequired: item.quantity,
      });

      const existing = lineMap.get(key);
      if (existing) {
        existing.quantityRequired += item.quantity;
      } else {
        lineMap.set(key, { key, variantId, sku, barcode, title, quantityRequired: item.quantity });
      }
    }
    breakdown.push({
      orderId: order.id,
      orderDisplayId: order.display_id,
      createdAt: order.created_at,
      items: perOrder,
    });
  }

  return { lines: [...lineMap.values()], breakdown };
}

/** Siguiente número correlativo de ola para una tienda. */
export async function nextWaveNumber(em: EntityManager, storeId: string): Promise<number> {
  const last = await em.findOne(
    PickingWave,
    { storeId },
    { orderBy: { displayNumber: 'DESC' } }
  );
  return (last?.displayNumber || 0) + 1;
}

/** Serializa una ola (con relaciones pobladas) para la respuesta JSON. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function serializeWave(wave: any) {
  const orders = wave.orders.getItems().sort((a: any, b: any) => a.priority - b.priority);
  const lines = wave.lines.getItems();
  return {
    id: wave.id,
    displayNumber: wave.displayNumber,
    storeId: wave.storeId,
    stationId: wave.stationId,
    status: wave.status,
    createdByName: wave.createdByName,
    createdAt: wave.createdAt,
    pickingStartedAt: wave.pickingStartedAt,
    sortingStartedAt: wave.sortingStartedAt,
    completedAt: wave.completedAt,
    orders: orders.map((o: any) => ({
      id: o.id,
      orderId: o.orderId,
      orderDisplayId: o.orderDisplayId,
      letter: o.letter,
      priority: o.priority,
      status: o.status,
      readyAt: o.readyAt,
      items: o.items.isInitialized()
        ? o.items.getItems().map((i: any) => ({
            id: i.id,
            lineItemId: i.lineItemId,
            sku: i.sku,
            barcode: i.barcode,
            quantityRequired: i.quantityRequired,
            quantitySorted: i.quantitySorted,
            quantityMissing: i.quantityMissing,
          }))
        : [],
    })),
    lines: lines.map((l: any) => ({
      id: l.id,
      variantId: l.variantId,
      sku: l.sku,
      barcode: l.barcode,
      title: l.title,
      quantityRequired: l.quantityRequired,
      quantityPicked: l.quantityPicked,
      quantityShort: l.quantityShort,
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
