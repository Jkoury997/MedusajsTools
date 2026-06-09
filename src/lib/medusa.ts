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

/**
 * Obtiene el ID del envío de ML de una orden.
 * Se usa para descargar la etiqueta de Mercado Envíos.
 */
export function getMLShipmentId(order: Order): number | null {
  return order.metadata?.ml_shipment_id ?? null;
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
  enviados: ['shipped', 'partially_shipped', 'delivered'],
};

// Caché de TODOS los pedidos pagados (120 segundos)
// Traemos todo una vez y filtramos en memoria por fulfillment status
const ORDERS_CACHE_DURATION = 120 * 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let allPaidOrdersCache: { orders: any[]; timestamp: number } | null = null;
let fetchingPromise: Promise<void> | null = null;

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

// Trae TODOS los pedidos de Medusa con paginación y los cachea
async function fetchAllOrders(): Promise<void> {
  const PAGE_SIZE = 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allOrders: any[] = [];
  let currentOffset = 0;
  let hasMore = true;

  console.log(`[fetchAllOrders] 📋 Cargando todos los pedidos de Medusa...`);
  const startTime = Date.now();

  // Solo traer pedidos de los últimos 15 días
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - 15);
  daysAgo.setHours(0, 0, 0, 0);
  const dateFilter = daysAgo.toISOString();

  // Campos reducidos: NO traemos variant.product.* entero (lo más pesado), pero sí
  // el external_id del producto (código que se muestra en faltantes/despacho).
  // +metadata se necesita para detectar órdenes de Mercado Libre (metadata.sales_channel)
  const fields = '+shipping_address.*,+customer.*,+items.*,+items.variant.*,+items.variant.product.external_id,+shipping_methods.*,+fulfillments.shipped_at,+fulfillments.delivered_at,+payment_collections.payments.*,+metadata';

  while (hasMore) {
    const response = await medusaRequest<{ orders: unknown[]; count: number; offset: number; limit: number }>(
      `/admin/orders?limit=${PAGE_SIZE}&offset=${currentOffset}&fields=${fields}&created_at[$gte]=${dateFilter}&order=-created_at`
    );

    const pageOrders = response.orders || [];
    allOrders = allOrders.concat(pageOrders);
    currentOffset += PAGE_SIZE;

    if (pageOrders.length < PAGE_SIZE || allOrders.length >= response.count) {
      hasMore = false;
    }
    // Seguridad: máximo 500 pedidos
    if (allOrders.length >= 500) {
      hasMore = false;
    }
  }

  // Filtrar pagados (captured) O pedidos con pago en efectivo, y excluir cancelados/archivados
  const paidOrders = allOrders.filter((order: any) => {
    const paymentStatus = order.payment_status?.toLowerCase();
    const orderStatus = order.status?.toLowerCase();
    if (orderStatus === 'canceled' || orderStatus === 'archived') return false;
    // Pagados normalmente
    if (paymentStatus === 'captured') return true;
    // Pago en efectivo: incluir aunque no esté pagado
    const isCash = isCashPayment(order);
    return isCash;
  });

  console.log(`[fetchAllOrders] ✅ ${paidOrders.length} pedidos (pagados + efectivo) de ${allOrders.length} totales (últimos 15 días) - ${Date.now() - startTime}ms`);

  allPaidOrdersCache = {
    orders: paidOrders,
    timestamp: Date.now(),
  };
}

// Obtiene todos los pedidos pagados (usa caché)
export async function getAllPaidOrders(): Promise<any[]> {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filteredOrders = allPaidOrders;
  if (fulfillmentFilter && fulfillmentFilterMap[fulfillmentFilter]) {
    const validStatuses = fulfillmentFilterMap[fulfillmentFilter];
    filteredOrders = allPaidOrders.filter((order: any) => {
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

// Función para invalidar el caché manualmente (por ejemplo, después de una acción)
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
