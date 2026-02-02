const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || 'https://backend.marcelakoury.com';
const MEDUSA_ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL || '';
const MEDUSA_ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD || '';

// Caché del token con expiración (50 minutos para ser conservadores, tokens suelen durar 1 hora)
const TOKEN_CACHE_DURATION = 50 * 60 * 1000;
let authToken: string | null = null;
let tokenExpiry: number = 0;

// Promise para evitar múltiples logins simultáneos
let loginPromise: Promise<string> | null = null;

interface MedusaRequestOptions {
  method?: string;
  body?: unknown;
}

// Login to get auth token
async function login(): Promise<string> {
  console.log('[Medusa Auth] 🔐 Iniciando login...');
  const startTime = Date.now();

  const response = await fetch(`${MEDUSA_BACKEND_URL}/auth/user/emailpass`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: MEDUSA_ADMIN_EMAIL,
      password: MEDUSA_ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Login error:', errorText);
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`[Medusa Auth] ✅ Login exitoso en ${Date.now() - startTime}ms`);

  // Guardar token y tiempo de expiración
  authToken = data.token;
  tokenExpiry = Date.now() + TOKEN_CACHE_DURATION;

  return data.token;
}

// Get auth token, login if needed (con manejo de requests concurrentes)
async function getAuthToken(): Promise<string> {
  // Si el token es válido, devolverlo inmediatamente
  if (authToken && Date.now() < tokenExpiry) {
    return authToken;
  }

  // Si ya hay un login en proceso, esperar a que termine
  if (loginPromise) {
    return loginPromise;
  }

  // Iniciar nuevo login
  loginPromise = login().finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

export async function medusaRequest<T>(endpoint: string, options: MedusaRequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const startTime = Date.now();

  console.log(`[Medusa API] 🚀 ${method} ${endpoint}`);

  const token = await getAuthToken();
  const tokenTime = Date.now();
  console.log(`[Medusa API] 🔑 Token obtenido en ${tokenTime - startTime}ms`);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const response = await fetch(`${MEDUSA_BACKEND_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const fetchTime = Date.now();
  console.log(`[Medusa API] 📥 Response ${response.status} en ${fetchTime - tokenTime}ms (total: ${fetchTime - startTime}ms)`);

  // If unauthorized, try to login again
  if (response.status === 401) {
    authToken = null;
    const newToken = await getAuthToken();

    const retryResponse = await fetch(`${MEDUSA_BACKEND_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    if (!retryResponse.ok) {
      const errorText = await retryResponse.text();
      console.error('Medusa API Error after retry:', {
        status: retryResponse.status,
        body: errorText,
      });
      throw new Error(`Medusa API error: ${retryResponse.status} ${retryResponse.statusText}`);
    }

    return retryResponse.json();
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Medusa API] ❌ Error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
      endpoint,
    });
    throw new Error(`Medusa API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const endTime = Date.now();
  console.log(`[Medusa API] ✅ Completado en ${endTime - startTime}ms total`);
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
  } | null;
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
  enviados: ['shipped', 'partially_shipped'],
};

// Caché de TODOS los pedidos pagados (30 segundos)
// Traemos todo una vez y filtramos en memoria por fulfillment status
const ORDERS_CACHE_DURATION = 30 * 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let allPaidOrdersCache: { orders: any[]; timestamp: number } | null = null;
let fetchingPromise: Promise<void> | null = null;

// Trae TODOS los pedidos de Medusa con paginación y los cachea
async function fetchAllOrders(): Promise<void> {
  const PAGE_SIZE = 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allOrders: any[] = [];
  let currentOffset = 0;
  let hasMore = true;

  console.log(`[fetchAllOrders] 📋 Cargando todos los pedidos de Medusa...`);
  const startTime = Date.now();

  while (hasMore) {
    const response = await medusaRequest<{ orders: unknown[]; count: number; offset: number; limit: number }>(
      `/admin/orders?limit=${PAGE_SIZE}&offset=${currentOffset}&fields=+shipping_address.*,+customer.*,+items.quantity,+shipping_methods.*`
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

  // Filtrar solo pagados (captured)
  const paidOrders = allOrders.filter((order: any) => {
    const paymentStatus = order.payment_status?.toLowerCase();
    return paymentStatus === 'captured';
  });

  console.log(`[fetchAllOrders] ✅ ${paidOrders.length} pedidos pagados de ${allOrders.length} totales - ${Date.now() - startTime}ms`);

  allPaidOrdersCache = {
    orders: paidOrders,
    timestamp: Date.now(),
  };
}

// Obtiene todos los pedidos pagados (usa caché)
async function getAllPaidOrders(): Promise<any[]> {
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
    `/admin/orders/${orderId}?fields=+items.*,+items.variant.*,+items.variant.product.*,+shipping_address.*,+billing_address.*,+customer.*,+shipping_methods.*`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = response.order as any;
  console.log(`[getOrderById] ✅ Pedido #${order?.display_id} con ${order?.items?.length || 0} items - ${Date.now() - startTime}ms`);

  return response as unknown as OrderResponse;
}
