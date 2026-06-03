/**
 * Helpers del picking por olas (batch). Las olas se arman en el DEPÓSITO CENTRAL
 * sobre el pool de pedidos a preparar (no están atadas a una tienda): se agrupan
 * hasta 8 pedidos, se recolectan juntos (consolidado por SKU) y se clasifican
 * en la mesa (put-to-wall). Convive con el flujo individual.
 */
import { getPaidOrders } from './medusa';
import type { EntityManager } from '@mikro-orm/postgresql';
import { PickingWave } from './entities';

/** Mesas físicas de clasificación disponibles (put-to-wall). */
export const STATIONS = ['mesa-1', 'mesa-2'] as const;
export type StationId = (typeof STATIONS)[number];

/** Letras de la mesa (8 posiciones). Una por pedido. */
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const MAX_ORDERS_PER_WAVE = LETTERS.length;

export function isValidStation(id: string): id is StationId {
  return (STATIONS as readonly string[]).includes(id);
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
 * Trae los pedidos a PREPARAR del depósito central (fulfillment_status
 * not_fulfilled / partially_fulfilled), de todas las tiendas, ordenados del más
 * antiguo al más nuevo (prioridad de la ola). El fulfillment se crea al cerrar
 * la ola, así que la ola se arma sobre pedidos todavía sin preparar.
 */
export async function getPendingOrders(): Promise<WaveOrderSource[]> {
  const preparar = await getPaidOrders(200, 0, 'preparar');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (preparar.orders as any[]).filter((order) => (order.items?.length || 0) > 0);

  // Más antiguos primero = mayor prioridad.
  orders.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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

/** Siguiente número correlativo de ola (global, depósito central). */
export async function nextWaveNumber(em: EntityManager): Promise<number> {
  const last = await em.findOne(PickingWave, {}, { orderBy: { displayNumber: 'DESC' } });
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
