import Link from 'next/link';
import { getOrderById, Order, LineItem } from '@/lib/medusa';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Extrae el código del producto (external_id del producto)
function getItemCode(item: LineItem): string {
  if (item.variant?.product?.external_id) {
    return item.variant.product.external_id;
  }
  if (item.variant?.sku) return item.variant.sku;
  return '-';
}

// Obtiene el nombre del producto
function getProductName(item: LineItem): string {
  return item.variant?.product?.title || item.product_title || item.title || 'Producto';
}

// Obtiene el color de la variante
function getItemColor(item: LineItem): string | null {
  return item.variant?.metadata?.color || null;
}

// Obtiene el talle de la variante
function getItemSize(item: LineItem): string | null {
  return item.variant?.metadata?.size || null;
}

// Obtiene el SKU de la variante
function getItemSku(item: LineItem): string | null {
  return item.variant?.sku || null;
}

// Obtiene la imagen del producto
function getItemThumbnail(item: LineItem): string | null {
  return item.variant?.product?.thumbnail || item.variant?.thumbnail || item.thumbnail || null;
}

// Componente de item para mobile (card) y desktop (table row)
function ItemCard({ item }: { item: LineItem }) {
  const code = getItemCode(item);
  const productName = getProductName(item);
  const color = getItemColor(item);
  const size = getItemSize(item);
  const sku = getItemSku(item);
  const thumbnail = getItemThumbnail(item);

  return (
    <div className="bg-white border-b last:border-b-0 p-4">
      <div className="flex gap-3">
        {/* Imagen */}
        {thumbnail && (
          <img
            src={thumbnail}
            alt={productName}
            className="w-16 h-16 object-cover rounded-lg border flex-shrink-0"
          />
        )}

        {/* Info del producto */}
        <div className="flex-1 min-w-0">
          {/* Código y cantidad en la misma línea */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-lg font-bold text-blue-600">{code}</span>
            <div className="flex items-center gap-2">
              <span className="bg-green-500 text-white text-lg font-bold w-10 h-10 rounded-full flex items-center justify-center">
                {item.quantity}
              </span>
              <input
                type="checkbox"
                className="w-7 h-7 rounded-lg border-2 border-gray-300 text-green-600 focus:ring-green-500 print:hidden"
                aria-label={`Marcar ${productName} como pickeado`}
              />
            </div>
          </div>

          {/* Nombre del producto */}
          <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{productName}</p>

          {/* SKU */}
          {sku && (
            <p className="text-xs text-gray-500 mb-2">SKU: {sku}</p>
          )}

          {/* Color y Talle */}
          <div className="flex flex-wrap gap-2">
            {color && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-800">
                {color}
              </span>
            )}
            {size && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800">
                Talle {size}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderHeader({ order }: { order: Order }) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="sticky top-0 z-10 bg-white border-b -mx-4 sm:-mx-6 lg:-mx-8 px-4 py-3 print:static print:border-0">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-gray-500 hover:text-gray-700 print:hidden">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="text-center flex-1">
          <h1 className="text-xl font-bold text-gray-900">Pedido #{order.display_id}</h1>
          <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
        </div>

        <PrintButton />
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-around mt-3 pt-3 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{totalItems}</p>
          <p className="text-xs text-gray-500">Artículos</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{order.items.length}</p>
          <p className="text-xs text-gray-500">Productos</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-green-600">{formatPrice(order.total)}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
      </div>
    </div>
  );
}

function CustomerInfo({ order }: { order: Order }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cliente</h3>

      <div className="space-y-2">
        {/* Nombre */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-sm font-medium text-gray-900">
            {order.customer
              ? `${order.customer.first_name} ${order.customer.last_name}`
              : order.shipping_address
                ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}`
                : 'N/A'}
          </span>
        </div>

        {/* Email */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-gray-600 truncate">{order.email}</span>
        </div>

        {/* Dirección */}
        {order.shipping_address && (
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm text-gray-600">
              {order.shipping_address.address_1}
              {order.shipping_address.address_2 && `, ${order.shipping_address.address_2}`}
              {`, ${order.shipping_address.city}`}
              {order.shipping_address.province && `, ${order.shipping_address.province}`}
              {` (${order.shipping_address.postal_code})`}
            </span>
          </div>
        )}

        {/* Teléfono */}
        {order.shipping_address?.phone && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a href={`tel:${order.shipping_address.phone}`} className="text-sm text-blue-600 font-medium">
              {order.shipping_address.phone}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  let order: Order | null = null;
  let error: string | null = null;

  try {
    const response = await getOrderById(id);
    order = response.order;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar el pedido';
    console.error('Error fetching order:', e);
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-sm w-full text-center">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-lg font-bold text-red-800 mb-2">Error</h1>
          <p className="text-red-600 text-sm mb-4">{error || 'Pedido no encontrado'}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            ← Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-6">
      <OrderHeader order={order} />

      <div className="mt-4">
        <CustomerInfo order={order} />

        {/* Lista de artículos */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h2 className="text-sm font-semibold text-gray-900">
              Artículos para Pickeo
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {order.items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* Print Footer */}
      <div className="hidden print:block mt-6 pt-4 border-t border-gray-300">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Pedido #{order.display_id}</span>
          <span>Impreso: {new Date().toLocaleDateString('es-AR')}</span>
        </div>
        <div className="mt-4 pt-4 border-t border-dashed">
          <p className="text-xs text-gray-500">
            Firma: _______________________________
          </p>
        </div>
      </div>
    </div>
  );
}
