/**
 * Helpers del picking por olas (batch). Las olas se arman en el DEPÓSITO CENTRAL
 * sobre el pool de pedidos a preparar (no están atadas a una tienda): se agrupan
 * hasta 8 pedidos, se recolectan juntos (consolidado por SKU) y se clasifican
 * en la mesa (put-to-wall). Convive con el flujo individual.
 */
import { getPaidOrders, getShippingOptionCodeMap, getVariantDetails } from './medusa';
import { classifyShippingName, type ShippingCategory } from './shipping';
import { config } from './config';
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
  shipping_methods?: {
    name?: string;
    shipping_option_id?: string;
    shipping_option?: { type?: { code?: string } | null } | null;
  }[] | null;
  metadata?: { sales_channel?: string } | null;
}

/**
 * Grupos de prioridad para armar las olas al inicio del día, de la prioridad
 * MÁS ALTA a la MÁS BAJA. Mercado Libre no es una categoría de envío sino el
 * canal de venta, por eso se evalúa aparte (entre "envío rápido" y "envío a
 * tienda"). El resto mapea 1:1 con las categorías de `shipping.ts`.
 */
export type WaveGroup =
  | 'express'
  | 'mercado_libre'
  | 'store_pickup'
  | 'correo'
  | 'via_cargo'
  | 'expreso_cliente'
  | 'factory_pickup'
  | 'other';

const WAVE_GROUP_ORDER: WaveGroup[] = [
  'express', // 1. envío rápido
  'mercado_libre', // 2. mercado libre
  'store_pickup', // 3. envío a tienda
  'correo', // 4. correo argentino
  'via_cargo', // 5. vía cargo
  'expreso_cliente', // 6. expreso
  'factory_pickup', // 7. retiro por fábrica
  'other', // 8. el resto
];

const WAVE_GROUP_LABEL: Record<WaveGroup, string> = {
  express: 'Envío rápido',
  mercado_libre: 'Mercado Libre',
  store_pickup: 'Envío a tienda',
  correo: 'Correo Argentino',
  via_cargo: 'Vía Cargo',
  expreso_cliente: 'Expreso',
  factory_pickup: 'Retiro en fábrica',
  other: 'El resto',
};

function isWaveGroup(value: string): value is WaveGroup {
  return (WAVE_GROUP_ORDER as string[]).includes(value);
}

/**
 * Mapa por defecto `type.code` (de la shipping option de Medusa) → grupo.
 * Fuente estable y semántica: opciones nuevas que reusen un code conocido (p.
 * ej. otro "Envío Rápido" con `fast_shipping`) caen solas en su grupo. Se puede
 * extender/pisar por env (`SHIPPING_TYPE_GROUPS`) sin tocar código.
 */
const CODE_GROUP_DEFAULT: Record<string, WaveGroup> = {
  fast_shipping: 'express',
  pickup_store: 'store_pickup',
  shipping_address_classic: 'correo',
  correo_pickup: 'correo',
  via_cargo_customer: 'via_cargo',
  express_shipping_customer: 'expreso_cliente',
  pickup_factory: 'factory_pickup',
};

/** Mapa code→grupo efectivo: default incorporado pisado por el override de env. */
function codeGroups(): Record<string, string> {
  return { ...CODE_GROUP_DEFAULT, ...config.shippingTypeGroups };
}

/**
 * Grupo de prioridad de un pedido. Orden de fuentes:
 *   1. Override exacto por `shipping_option_id` (env `SHIPPING_OPTION_GROUPS`).
 *   2. `type.code` de la shipping option (default incorporado + env).
 *   3. Envío rápido por nombre (manda incluso sobre Mercado Libre).
 *   4. Canal de venta Mercado Libre (`metadata.sales_channel`).
 *   5. Fallback: clasificación por nombre del método (`shipping.ts`).
 */
export function waveGroup(order: WaveOrderSource): WaveGroup {
  const method = order.shipping_methods?.[0];

  // 1. Override exacto por ID (si lo configuraste por env).
  const optionId = method?.shipping_option_id;
  if (optionId) {
    const mapped = config.shippingOptionGroups[optionId];
    if (mapped && isWaveGroup(mapped)) return mapped;
  }

  // 2. Categoría estable por type.code.
  const code = method?.shipping_option?.type?.code;
  if (code) {
    const mapped = codeGroups()[code];
    if (mapped && isWaveGroup(mapped)) return mapped;
  }

  // 3/4/5. Fallbacks por nombre / canal.
  const category: ShippingCategory = classifyShippingName(method?.name);
  if (category === 'express') return 'express';
  if (order.metadata?.sales_channel === 'mercadolibre') return 'mercado_libre';
  return category as WaveGroup;
}

/** Índice de prioridad del grupo (0 = más alta). */
export function waveGroupPriority(group: WaveGroup): number {
  return WAVE_GROUP_ORDER.indexOf(group);
}

/** Etiqueta legible del grupo de prioridad. */
export function waveGroupLabel(group: WaveGroup): string {
  return WAVE_GROUP_LABEL[group];
}

/** Comparador de olas: prioridad de grupo y, dentro del grupo, más antiguo primero. */
export function compareWavePriority(a: WaveOrderSource, b: WaveOrderSource): number {
  const ga = waveGroupPriority(waveGroup(a));
  const gb = waveGroupPriority(waveGroup(b));
  if (ga !== gb) return ga - gb;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/**
 * Trae los pedidos a PREPARAR del depósito central (fulfillment_status
 * not_fulfilled / partially_fulfilled), de todas las tiendas, ordenados por
 * PRIORIDAD de grupo (envío rápido → ML → tienda → correo → vía cargo →
 * expreso → fábrica → el resto) y, dentro de cada grupo, del más antiguo al más
 * nuevo. El fulfillment se crea al cerrar la ola, así que la ola se arma sobre
 * pedidos todavía sin preparar.
 */
export async function getPendingOrders(): Promise<WaveOrderSource[]> {
  const [preparar, codeMap] = await Promise.all([
    getPaidOrders(200, 0, 'preparar'),
    getShippingOptionCodeMap(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (preparar.orders as any[]).filter((order) => (order.items?.length || 0) > 0);

  // Enriquecer cada pedido con el type.code de su shipping option (de un fetch
  // aparte, cacheado), para que waveGroup lo use sin expandir la relación.
  for (const order of orders) {
    const method = order.shipping_methods?.[0];
    const code = method?.shipping_option_id ? codeMap[method.shipping_option_id] : undefined;
    if (method && code) {
      method.shipping_option = { ...(method.shipping_option || {}), type: { code } };
    }
  }

  orders.sort(compareWavePriority);

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
  key: string;
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
        key,
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
  // find (no findOne) porque MikroORM prohíbe findOne con where vacío.
  const [last] = await em.find(PickingWave, {}, { orderBy: { displayNumber: 'DESC' }, limit: 1 });
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

/**
 * Enriquece las líneas consolidadas de una ola serializada con talle, color y
 * external_id (código del producto), traídos de Medusa por variantId. Sirve
 * para identificar artículos sin barcode en la recolección (scan + manual).
 * Es defensivo: si Medusa falla, devuelve la ola tal cual.
 */
export async function attachLineDetails(serialized: any): Promise<any> {
  const lines: any[] = serialized.lines || [];
  const variantIds = lines.map((l) => l.variantId).filter((v): v is string => !!v);
  if (variantIds.length === 0) return serialized;
  const details = await getVariantDetails(variantIds);
  serialized.lines = lines.map((l) => {
    const d = l.variantId ? details[l.variantId] : undefined;
    return {
      ...l,
      sku: l.sku || d?.sku,
      size: d?.size,
      color: d?.color,
      externalId: d?.externalId,
    };
  });
  return serialized;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
