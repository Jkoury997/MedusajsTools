const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || 'https://backend.marcelakoury.com';
const MEDUSA_ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL || '';
const MEDUSA_ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD || '';

// Store the auth token in memory
let authToken: string | null = null;

interface MedusaRequestOptions {
  method?: string;
  body?: unknown;
}

// Login to get auth token
async function login(): Promise<string> {
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
  // MedusaJS v2 returns token in the response
  return data.token;
}

// Get auth token, login if needed
async function getAuthToken(): Promise<string> {
  if (!authToken) {
    authToken = await login();
  }
  return authToken;
}

export async function medusaRequest<T>(endpoint: string, options: MedusaRequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const token = await getAuthToken();

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
    console.error('Medusa API Error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
      endpoint,
    });
    throw new Error(`Medusa API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
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

// Fetch paid orders - MedusaJS v2 API (optimizado para listado)
export async function getPaidOrders(limit = 50, offset = 0): Promise<OrdersResponse> {
  // Solo traer los campos necesarios para el listado (sin items detallados)
  const response = await medusaRequest<{ orders: unknown[]; count: number; offset: number; limit: number }>(
    `/admin/orders?limit=${limit}&offset=${offset}&fields=+shipping_address.*,+customer.*,+items.quantity`
  );

  // Filtrar solo pedidos con pago capturado (captured = pagado)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOrders = response.orders as any[];
  const paidOrders = allOrders.filter((order: any) => {
    const paymentStatus = order.payment_status?.toLowerCase();
    return paymentStatus === 'captured';
  });

  return {
    orders: paidOrders,
    count: paidOrders.length,
    offset: response.offset,
    limit: response.limit,
  } as OrdersResponse;
}

// Fetch single order by ID - MedusaJS v2 API (con todos los detalles)
export async function getOrderById(orderId: string): Promise<OrderResponse> {
  const response = await medusaRequest<{ order: unknown }>(
    `/admin/orders/${orderId}?fields=+items.*,+items.variant.*,+items.variant.product.*,+shipping_address.*,+billing_address.*,+customer.*`
  );
  return response as unknown as OrderResponse;
}
