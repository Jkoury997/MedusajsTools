import { config } from './config';

interface MedusaRequestOptions {
  method?: string;
  body?: unknown;
}

export async function medusaRequest<T>(endpoint: string, options: MedusaRequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const startTime = Date.now();

  console.log(`[Medusa API] ${method} ${endpoint}`);

  // Medusa v2: autenticación de admin con SECRET API KEY vía Basic auth.
  // El esquema es base64("<secret_key>:") — la key como usuario, password vacío.
  // (Reemplaza el login con email/password del admin.)
  const basic = Buffer.from(`${config.medusaSecretApiKey}:`).toString('base64');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${basic}`,
  };

  const response = await fetch(`${config.medusaBackendUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  console.log(`[Medusa API] Response ${response.status} en ${Date.now() - startTime}ms`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Medusa API] Error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
      endpoint,
    });
    throw new Error(`Medusa API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`[Medusa API] Completado en ${Date.now() - startTime}ms`);
  return result;
}

// Types for MedusaJS v2 Orders
export interface VariantMetadata {
  size?: string;
  color?: string;
  colorHexa?: string;
  external_id?: string;
}

export interface ProductData {
  id: string;
  title: string;
  handle: string;
  thumbnail?: string | null;
  external_id?: string;
  description?: string | null;
}

export interface VariantData {
  id: string;
  sku: string | null;
  barcode: string | null;
  title: string;
  thumbnail?: string | null;
  metadata?: VariantMetadata;
  product?: ProductData;
  product_id?: string;
}

export interface LineItem {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  // MedusaJS v2 fields
  product_title?: string;
  product_handle?: string;
  variant_sku?: string;
  variant_barcode?: string;
  variant_title?: string;
  // Nested structure with full data
  variant?: VariantData | null;
  product_id?: string | null;
}

export interface AddressMetadata {
  dni?: string;
  floor?: string;
  apartment?: string;
  street_name?: string;
  street_number?: string;
}

export interface Address {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2: string | null;
  city: string;
  province: string | null;
  postal_code: string;
  country_code: string;
  phone: string | null;
  company?: string | null;
  metadata?: AddressMetadata | null;
}

export interface StorePickupData {
  id: string;
  name: string;
  address: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  amount: number;
  shipping_option_id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shipping_option?: any;
  data?: {
    store?: StorePickupData;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  } | null;
}

/**
 * Metadata de la orden.
 * sales_channel indica de dónde vino la venta ("mercadolibre" o undefined para web).
 * Los campos ml_* solo están presentes en órdenes de Mercado Libre.
 */
export interface OrderMetadata {
  sales_channel?: string;           // "mercadolibre" si viene de ML
  ml_order_id?: number;             // ID de la orden en ML
  ml_shipment_id?: number;          // ID del envío en ML (para descargar etiqueta)
  ml_pack_id?: number | null;       // ID del pack/carrito en ML
  ml_buyer_id?: number;             // ID del comprador en ML
  ml_buyer_nickname?: string;       // Nickname del comprador en ML
  ml_shipment_status?: string;      // Estado del envío en ML
  ml_tracking_number?: string;      // Número de tracking de ML
  [key: string]: unknown;
}

export interface Order {
  id: string;
  display_id: number;
  status: string;
  fulfillment_status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  email: string;
  currency_code: string;
  total: number;
  subtotal: number;
  tax_total: number;
  shipping_total: number;
  items: LineItem[];
  shipping_address: Address | null;
  billing_address: Address | null;
  shipping_methods?: ShippingMethod[];
  customer: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone?: string | null;
  } | null;
  /** Metadata de la orden — contiene info de ML si es una venta de Mercado Libre */
  metadata?: OrderMetadata | null;
}

/**
 * Verifica si una orden proviene de Mercado Libre.
 * Se usa para mostrar el badge de ML y la etiqueta de envío correcta.
 */
export function isMercadoLibreOrder(order: Order): boolean {
  return order.metadata?.sales_channel === "mercadolibre";
}

export interface OrdersResponse {
  orders: Order[];
  count: number;
  offset: number;
  limit: number;
}

export interface OrderResponse {
  order: Order;
}

// Tipos de filtro por estado de fulfillment
export type FulfillmentFilter = 'preparar' | 'enviar' | 'enviados';

// Mapeo de filtros a estados de fulfillment
const fulfillmentFilterMap: Record<FulfillmentFilter, string[]> = {
  preparar: ['not_fulfilled', 'partially_fulfilled'],
  enviar: ['fulfilled'],
  // partially_delivered: fulfillment parcial (faltantes) ya entregado — sigue
  // siendo un pedido enviado; sin él, desaparecía del portal de tienda.
  enviados: ['shipped', 'partially_shipped', 'delivered', 'partially_delivered'],
};

// Caché del mapa shipping_option_id -> type.code (categoría estable del envío).
// Se trae aparte de las órdenes (la relación no es expandible desde la orden).
const SHIPPING_OPTIONS_CACHE_DURATION = 10 * 60 * 1000; // 10 min
let shippingOptionCodeCache: { map: Record<string, string>; timestamp: number } | null = null;

/** Devuelve { shipping_option_id: type.code } de Medusa, cacheado 10 min. */
export async function getShippingOptionCodeMap(): Promise<Record<string, string>> {
  if (shippingOptionCodeCache && Date.now() - shippingOptionCodeCache.timestamp < SHIPPING_OPTIONS_CACHE_DURATION) {
    return shippingOptionCodeCache.map;
  }
  try {
    const data = await medusaRequest<{ shipping_options: { id: string; type?: { code?: string } | null }[] }>(
      '/admin/shipping-options?limit=200&fields=id,type.code',
    );
    const map: Record<string, string> = {};
    for (const o of data.shipping_options || []) {
      if (o.id && o.type?.code) map[o.id] = o.type.code;
    }
    shippingOptionCodeCache = { map, timestamp: Date.now() };
    return map;
  } catch (e) {
    console.error('[getShippingOptionCodeMap] Error:', e);
    return shippingOptionCodeCache?.map || {};
  }
}

/** Detalle de una variante para mostrar en la recolección. */
export interface VariantDetail {
  sku?: string;
  size?: string;
  color?: string;
  /** external_id del PRODUCTO (el "código" con el que se identifica el artículo). */
  externalId?: string;
}

// Caché por variante (no expira en la vida del proceso: los atributos de una
// variante no cambian). Evita refetchear los mismos variantId entre olas.
const variantDetailCache = new Map<string, VariantDetail>();

/**
 * Devuelve { variantId: { sku, size, color, externalId } } para los variantId
 * dados, trayendo de Medusa solo los que falten (cacheados). Es DEFENSIVO: ante
 * cualquier error devuelve lo que tenga (nunca lanza), así no rompe la lectura
 * de la ola si Medusa falla.
 */
export async function getVariantDetails(variantIds: string[]): Promise<Record<string, VariantDetail>> {
  const missing = [...new Set(variantIds.filter((id) => id && !variantDetailCache.has(id)))];
  if (missing.length > 0) {
    try {
      const idParams = missing.map((id) => `id[]=${encodeURIComponent(id)}`).join('&');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await medusaRequest<{ variants: any[] }>(
        `/admin/product-variants?${idParams}&fields=id,sku,metadata,product.external_id&limit=${missing.length}`,
      );
      for (const v of data.variants || []) {
        variantDetailCache.set(v.id, {
          sku: v.sku,
          size: v.metadata?.size,
          color: v.metadata?.color,
          externalId: v.product?.external_id,
        });
      }
      // Cachear los que no volvieron como vacíos, para no refetchearlos.
      for (const id of missing) if (!variantDetailCache.has(id)) variantDetailCache.set(id, {});
    } catch (e) {
      console.error('[getVariantDetails] Error:', e);
    }
  }
  const out: Record<string, VariantDetail> = {};
  for (const id of variantIds) if (id) out[id] = variantDetailCache.get(id) || {};
  return out;
}

// Detectar si un pedido tiene pago en efectivo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCashPayment(order: any): boolean {
  const collections = order.payment_collections || [];
  for (const col of collections) {
    for (const payment of col.payments || []) {
      if (payment.provider_id === 'pp_cash_cash') return true;
    }
  }
  return false;
}

// ─── Caché de pedidos ────────────────────────────────────────────────────────
//
// Todas las pantallas (gestión, despacho, faltantes, olas, portal de tienda,
// stats) leen de UN caché en memoria con los pedidos pagados (o en efectivo),
// armado en dos niveles:
//
//  1. RECIENTES: todos los pedidos creados en los últimos RECENT_DAYS días
//     (abiertos y cerrados), SIN tope de cantidad. Se recarga cada 2 minutos o
//     apenas se invalida después de una acción (preparar, enviar, entregar…).
//
//  2. ATRASADOS: pedidos más viejos (hasta BACKLOG_DAYS días) que todavía
//     piden una acción —sin preparar, preparados sin enviar, en tienda sin
//     retirar, con faltantes sin resolver— o que se despacharon/entregaron en
//     los últimos RECENT_DAYS días (para que se vean en "Enviados" y en
//     "Entregados hoy" de la tienda). Un barrido completo cada 30 minutos los
//     encuentra; en cada recarga intermedia se re-consultan solo esos por id
//     (1–2 requests) para ver si cambiaron de estado.
//
// Antes había una sola ventana de 15 días con un tope de 500 pedidos. Con ~40
// pedidos por día el tope se llenaba en ~12 días (~6 en eventos) y cualquier
// pedido más viejo SIN TERMINAR desaparecía de todas las listas.

/** Ventana en la que se trae todo, abierto o cerrado. */
const RECENT_DAYS = 15;
/** Hasta cuántos días atrás se rescatan pedidos que siguen abiertos. */
const BACKLOG_DAYS = 90;
/** Vida del caché de pedidos (recientes + re-consulta de atrasados). */
const ORDERS_CACHE_DURATION = 120 * 1000;
/** Cada cuánto se re-barre la ventana de atrasados buscando abiertos nuevos. */
const BACKLOG_SCAN_INTERVAL = 30 * 60 * 1000;
const PAGE_SIZE = 100;
/** Requests simultáneos a Medusa al paginar (antes eran de a uno). */
const PAGE_CONCURRENCY = 4;
/** Tope de SEGURIDAD por consulta (10.000 pedidos). Si se alcanza, avisa en el log. */
const MAX_PAGES = 100;
/** Ids por request al re-consultar atrasados (mantiene la URL corta). */
const IDS_PER_REQUEST = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Estados de Medusa en los que el pedido todavía espera una acción nuestra. */
const OPEN_FULFILLMENT_STATUSES = ['not_fulfilled', 'partially_fulfilled', 'fulfilled'];

// Campos reducidos: NO traemos variant.product.* entero (lo más pesado), pero sí
// el external_id del producto (código que se muestra en faltantes/despacho).
// +metadata se necesita para detectar órdenes de Mercado Libre (metadata.sales_channel)
const ORDER_LIST_FIELDS = '+shipping_address.*,+customer.*,+items.*,+items.variant.*,+items.variant.product.external_id,+shipping_methods.*,+fulfillments.shipped_at,+fulfillments.delivered_at,+payment_collections.payments.*,+metadata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MedusaOrder = any;
type OrderListResponse = { orders?: MedusaOrder[]; count?: number };

let allPaidOrdersCache: { orders: MedusaOrder[]; timestamp: number } | null = null;
let fetchingPromise: Promise<void> | null = null;
/** Pedidos atrasados relevantes, con la hora del último barrido completo. */
let backlogCache: { orders: MedusaOrder[]; scannedAt: number } | null = null;

/** Medianoche (hora del server) de hace `days` días. */
function startOfDayDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Aplica `fn` a cada elemento con a lo sumo `limit` en paralelo (respeta el orden). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function dedupeById(orders: MedusaOrder[]): MedusaOrder[] {
  const byId = new Map<string, MedusaOrder>();
  for (const o of orders) if (o?.id) byId.set(o.id, o);
  return [...byId.values()];
}

/** Pagado (captured) o en efectivo, y no cancelado/archivado. */
function isPaidActiveOrder(order: MedusaOrder): boolean {
  const paymentStatus = order.payment_status?.toLowerCase();
  const orderStatus = order.status?.toLowerCase();
  if (orderStatus === 'canceled' || orderStatus === 'archived') return false;
  if (paymentStatus === 'captured') return true;
  // Pago en efectivo: incluir aunque no esté pagado
  return isCashPayment(order);
}

/**
 * ¿Hay que seguir mostrando este pedido viejo? Sí si todavía espera una acción
 * (sin preparar, o preparado y sin enviar —incluye el retiro en tienda que
 * espera al cliente, que en Medusa queda `fulfilled`—), si tiene faltantes sin
 * resolver, o si se despachó/entregó dentro de la ventana reciente.
 */
function isBacklogRelevant(order: MedusaOrder, openFaltanteIds: Set<string>, recentStart: Date): boolean {
  if (!isPaidActiveOrder(order)) return false;
  if (OPEN_FULFILLMENT_STATUSES.includes(order.fulfillment_status || 'not_fulfilled')) return true;
  if (openFaltanteIds.has(order.id)) return true;
  const since = recentStart.getTime();
  const fulfillments: { shipped_at?: string | null; delivered_at?: string | null }[] = order.fulfillments || [];
  return fulfillments.some((f) =>
    [f.shipped_at, f.delivered_at].some((d) => !!d && new Date(d).getTime() >= since)
  );
}

/**
 * Ids de pedidos con faltantes sin resolver (pending / waiting) según la base
 * local: pueden estar en cualquier estado de Medusa y igual hay que mostrarlos.
 * Si la base falla, devuelve vacío (solo se pierde ese caso borde).
 */
async function getOpenFaltanteOrderIds(): Promise<Set<string>> {
  try {
    const [{ getEm }, { PickingSession }] = await Promise.all([import('./db'), import('./entities')]);
    const em = await getEm();
    const sessions = await em.find(
      PickingSession,
      { status: 'completed', totalMissing: { $gt: 0 }, faltanteResolution: { $in: ['pending', 'waiting'] } },
      { fields: ['orderId'] }
    );
    return new Set(sessions.map((s) => s.orderId));
  } catch (e) {
    console.error('[orders] No se pudieron leer los faltantes abiertos:', e);
    return new Set();
  }
}

function fetchOrderPage(filter: string, offset: number): Promise<OrderListResponse> {
  return medusaRequest<OrderListResponse>(
    `/admin/orders?limit=${PAGE_SIZE}&offset=${offset}&fields=${ORDER_LIST_FIELDS}&${filter}&order=created_at`
  );
}

/**
 * Trae TODOS los pedidos que matchean `filter`. La primera página da el total y
 * el resto se pide en paralelo. Orden ascendente por creación: un pedido que
 * entra durante la carga va al final y no corre los offsets de las páginas ya
 * pedidas (con orden descendente + páginas en paralelo se podían saltear
 * pedidos). Si la última página vino llena, sigue hasta agotar.
 */
async function fetchOrdersPaged(filter: string, label: string): Promise<MedusaOrder[]> {
  const first = await fetchOrderPage(filter, 0);
  const pages: MedusaOrder[][] = [first.orders || []];

  const expectedPages = Math.min(Math.ceil((first.count || 0) / PAGE_SIZE), MAX_PAGES);
  const offsets = Array.from({ length: Math.max(expectedPages - 1, 0) }, (_, i) => (i + 1) * PAGE_SIZE);
  const rest = await mapWithConcurrency(offsets, PAGE_CONCURRENCY, (offset) => fetchOrderPage(filter, offset));
  for (const page of rest) pages.push(page.orders || []);

  // Entraron pedidos mientras cargábamos: la última página vino llena, seguir.
  while (pages.length < MAX_PAGES && pages[pages.length - 1].length === PAGE_SIZE) {
    const page = await fetchOrderPage(filter, pages.length * PAGE_SIZE);
    pages.push(page.orders || []);
  }
  if (pages[pages.length - 1].length === PAGE_SIZE) {
    console.warn(`[orders] ⚠️ ${label}: se alcanzó el tope de seguridad de ${MAX_PAGES * PAGE_SIZE} pedidos; puede haber pedidos sin cargar`);
  }

  return dedupeById(pages.flat());
}

/** Trae pedidos puntuales por id (en tandas de IDS_PER_REQUEST, en paralelo). */
async function fetchOrdersByIds(ids: string[]): Promise<MedusaOrder[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) chunks.push(ids.slice(i, i + IDS_PER_REQUEST));
  const pages = await mapWithConcurrency(chunks, PAGE_CONCURRENCY, (chunk) => {
    const idParams = chunk.map((id) => `id[]=${encodeURIComponent(id)}`).join('&');
    return medusaRequest<OrderListResponse>(
      `/admin/orders?${idParams}&limit=${chunk.length}&fields=${ORDER_LIST_FIELDS}`
    );
  });
  return pages.flatMap((p) => p.orders || []);
}

/**
 * Barrido completo de atrasados: todo lo creado entre BACKLOG_DAYS días atrás y
 * el inicio de la ventana reciente, quedándose con lo relevante. Se solapa 1 día
 * con la ventana reciente para que, cuando esta avanza a la medianoche, los
 * pedidos que salen de ella ya estén acá (sin hueco hasta el próximo barrido).
 */
async function scanBacklog(recentStart: Date, openFaltanteIds: Set<string>): Promise<MedusaOrder[]> {
  const from = startOfDayDaysAgo(BACKLOG_DAYS).toISOString();
  const to = new Date(recentStart.getTime() + DAY_MS).toISOString();
  const orders = await fetchOrdersPaged(`created_at[$gte]=${from}&created_at[$lt]=${to}`, 'atrasados');
  return orders.filter((o) => isBacklogRelevant(o, openFaltanteIds, recentStart));
}

/**
 * Atrasados actualizados. Barrido completo si no hay datos o si el último tiene
 * más de BACKLOG_SCAN_INTERVAL; si no, re-consulta por id solo los que ya
 * teníamos y que quedan fuera de la ventana reciente (los de adentro llegan
 * frescos con los recientes). Si Medusa falla acá, se sigue con lo que había:
 * no rompe las pantallas, solo queda un error en el log.
 */
async function refreshBacklog(recentStart: Date): Promise<MedusaOrder[]> {
  const openFaltanteIds = await getOpenFaltanteOrderIds();
  const now = Date.now();

  if (!backlogCache || now - backlogCache.scannedAt > BACKLOG_SCAN_INTERVAL) {
    try {
      const orders = await scanBacklog(recentStart, openFaltanteIds);
      backlogCache = { orders, scannedAt: now };
      return orders;
    } catch (e) {
      console.error('[orders] Falló el barrido de pedidos atrasados:', e);
      if (!backlogCache) return [];
      // Hay datos de antes: re-consultarlos por id (el barrido se reintenta en la próxima recarga).
    }
  }

  const since = recentStart.getTime();
  const covered = backlogCache.orders.filter((o) => new Date(o.created_at).getTime() >= since);
  const outside = backlogCache.orders.filter((o) => new Date(o.created_at).getTime() < since);
  if (outside.length === 0) return backlogCache.orders;

  try {
    const fresh = await fetchOrdersByIds(outside.map((o) => o.id));
    const orders = [...covered, ...fresh.filter((o) => isBacklogRelevant(o, openFaltanteIds, recentStart))];
    backlogCache = { orders, scannedAt: backlogCache.scannedAt };
    return orders;
  } catch (e) {
    console.error('[orders] Falló la re-consulta de pedidos atrasados:', e);
    return backlogCache.orders;
  }
}

/** Recarga el caché: recientes + atrasados, en paralelo. */
async function fetchAllOrders(): Promise<void> {
  console.log(`[fetchAllOrders] 📋 Cargando pedidos de Medusa...`);
  const startTime = Date.now();
  const recentStart = startOfDayDaysAgo(RECENT_DAYS);

  const [recent, backlog] = await Promise.all([
    fetchOrdersPaged(`created_at[$gte]=${recentStart.toISOString()}`, 'recientes'),
    refreshBacklog(recentStart),
  ]);

  // Lo reciente manda (dato más fresco); de los atrasados, solo lo que no está.
  const recentIds = new Set(recent.map((o) => o.id));
  const recentPaid = recent.filter(isPaidActiveOrder);
  const older = backlog.filter((o) => !recentIds.has(o.id));
  const paidOrders = [...recentPaid, ...older].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  console.log(
    `[fetchAllOrders] ✅ ${paidOrders.length} pedidos (pagados + efectivo): ` +
    `${recentPaid.length} de los últimos ${RECENT_DAYS} días (de ${recent.length} totales) + ` +
    `${older.length} más viejos todavía abiertos o movidos hace poco (hasta ${BACKLOG_DAYS} días) - ${Date.now() - startTime}ms`
  );

  allPaidOrdersCache = {
    orders: paidOrders,
    timestamp: Date.now(),
  };
}

// Obtiene todos los pedidos pagados (usa caché)
export async function getAllPaidOrders(): Promise<MedusaOrder[]> {
  // Si el caché es válido, usarlo
  if (allPaidOrdersCache && Date.now() - allPaidOrdersCache.timestamp < ORDERS_CACHE_DURATION) {
    console.log(`[getPaidOrders] ⚡ Usando caché (${allPaidOrdersCache.orders.length} pedidos pagados)`);
    return allPaidOrdersCache.orders;
  }

  // Si ya hay un fetch en curso, esperar
  if (fetchingPromise) {
    await fetchingPromise;
    return allPaidOrdersCache?.orders || [];
  }

  // Iniciar nuevo fetch
  fetchingPromise = fetchAllOrders().finally(() => {
    fetchingPromise = null;
  });
  await fetchingPromise;

  return allPaidOrdersCache?.orders || [];
}

// Fetch paid orders - MedusaJS v2 API
// Nota: Medusa v2 tiene bugs con filtros de payment_status/fulfillment_status en query params,
// así que traemos todos y filtramos en memoria.
export async function getPaidOrders(
  limit = 50,
  offset = 0,
  fulfillmentFilter?: FulfillmentFilter
): Promise<OrdersResponse> {
  const allPaidOrders = await getAllPaidOrders();

  // Aplicar filtro de fulfillment si se especifica
  let filteredOrders = allPaidOrders;
  if (fulfillmentFilter && fulfillmentFilterMap[fulfillmentFilter]) {
    const validStatuses = fulfillmentFilterMap[fulfillmentFilter];
    filteredOrders = allPaidOrders.filter((order: MedusaOrder) => {
      const status = order.fulfillment_status || 'not_fulfilled';
      return validStatuses.includes(status);
    });
  }

  const result = {
    orders: filteredOrders,
    count: filteredOrders.length,
    offset: 0,
    limit: filteredOrders.length,
  } as OrdersResponse;

  return result;
}

// Función para invalidar el caché manualmente (por ejemplo, después de una acción).
// Invalida solo la ventana reciente: los atrasados se re-consultan por id en la
// próxima carga (barato), sin repetir el barrido completo.
export function invalidateOrdersCache() {
  allPaidOrdersCache = null;
  console.log('[getPaidOrders] 🗑️ Caché invalidado');
}

// Fetch single order by ID - MedusaJS v2 API (con todos los detalles)
export async function getOrderById(orderId: string): Promise<OrderResponse> {
  console.log(`[getOrderById] 📦 Cargando pedido ${orderId}...`);
  const startTime = Date.now();

  const response = await medusaRequest<{ order: unknown }>(
    `/admin/orders/${orderId}?fields=+items.*,+items.variant.*,+items.variant.product.*,+shipping_address.*,+billing_address.*,+customer.*,+shipping_methods.*,+payment_collections.payments.*,+metadata`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = response.order as any;
  console.log(`[getOrderById] ✅ Pedido #${order?.display_id} con ${order?.items?.length || 0} items - ${Date.now() - startTime}ms`);

  return response as unknown as OrderResponse;
}
