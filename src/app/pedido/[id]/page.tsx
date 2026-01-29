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
  // Usar external_id del producto
  if (item.variant?.product?.external_id) {
    return item.variant.product.external_id;
  }
  // Fallback al SKU de la variante
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

function ItemRow({ item, index }: { item: LineItem; index: number }) {
  const code = getItemCode(item);
  const productName = getProductName(item);
  const color = getItemColor(item);
  const size = getItemSize(item);
  const sku = getItemSku(item);
  const thumbnail = getItemThumbnail(item);

  return (
    <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
      <td className="px-4 py-4 text-sm font-mono text-gray-900 whitespace-nowrap">
        <span className="text-lg font-bold text-blue-600">{code}</span>
        {sku && (
          <p className="text-xs text-gray-500 mt-1">SKU: {sku}</p>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-gray-900">
        <div className="flex items-center gap-3">
          {thumbnail && (
            <img
              src={thumbnail}
              alt={productName}
              className="w-14 h-14 object-cover rounded border print:w-10 print:h-10"
            />
          )}
          <div>
            <p className="font-medium text-gray-900">{productName}</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {color && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  Color: <strong className="ml-1">{color}</strong>
                </span>
              )}
              {size && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  Talle: <strong className="ml-1">{size}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-center">
        <span className="inline-flex items-center justify-center w-12 h-12 bg-green-100 text-green-800 font-bold text-xl rounded-full print:bg-gray-200 print:text-gray-900">
          {item.quantity}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-600 text-center print:hidden">
        <input
          type="checkbox"
          className="w-6 h-6 rounded border-gray-300 text-green-600 focus:ring-green-500"
          aria-label={`Marcar ${productName} como pickeado`}
        />
      </td>
    </tr>
  );
}

function OrderSummary({ order }: { order: Order }) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueItems = order.items.length;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6 print:shadow-none print:border print:border-gray-300">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Pedido #{order.display_id}
          </h1>
          <p className="text-gray-500 mt-1">{formatDate(order.created_at)}</p>
        </div>

        <div className="flex gap-4 print:hidden">
          <PrintButton />
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            ← Volver
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
        <div>
          <p className="text-sm text-gray-500">Total de artículos</p>
          <p className="text-xl font-bold text-gray-900">{totalItems}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Productos únicos</p>
          <p className="text-xl font-bold text-gray-900">{uniqueItems}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Total del pedido</p>
          <p className="text-xl font-bold text-gray-900">
            {formatPrice(order.total)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Estado</p>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
            Pago Confirmado
          </span>
        </div>
      </div>

      {/* Customer Info */}
      <div className="mt-6 pt-6 border-t">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Información del Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Nombre: </span>
            <span className="text-gray-900">
              {order.customer
                ? `${order.customer.first_name} ${order.customer.last_name}`
                : order.shipping_address
                  ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}`
                  : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Email: </span>
            <span className="text-gray-900">{order.email}</span>
          </div>
          {order.shipping_address && (
            <>
              <div className="md:col-span-2">
                <span className="text-gray-500">Dirección de envío: </span>
                <span className="text-gray-900">
                  {order.shipping_address.address_1}
                  {order.shipping_address.address_2 && `, ${order.shipping_address.address_2}`}
                  {`, ${order.shipping_address.city}`}
                  {order.shipping_address.province && `, ${order.shipping_address.province}`}
                  {` (${order.shipping_address.postal_code})`}
                </span>
              </div>
              {order.shipping_address.phone && (
                <div>
                  <span className="text-gray-500">Teléfono: </span>
                  <span className="text-gray-900">{order.shipping_address.phone}</span>
                </div>
              )}
            </>
          )}
        </div>
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h1 className="text-xl font-bold text-red-800 mb-2">Error al cargar el pedido</h1>
        <p className="text-red-600">{error || 'Pedido no encontrado'}</p>
        <Link
          href="/"
          className="inline-flex items-center mt-4 text-blue-600 hover:text-blue-800"
        >
          ← Volver al listado
        </Link>
      </div>
    );
  }

  return (
    <div className="print:p-0">
      <OrderSummary order={order} />

      {/* Items Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden print:shadow-none print:border print:border-gray-300">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 print:bg-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Lista de Artículos para Pickeo
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 print:bg-gray-100">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Producto
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cantidad
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider print:hidden">
                  Pickeado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {order.items.map((item, index) => (
                <ItemRow key={item.id} item={item} index={index} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Print Footer */}
        <div className="hidden print:block px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Pedido #{order.display_id}</span>
            <span>Fecha de impresión: {new Date().toLocaleDateString('es-AR')}</span>
          </div>
          <div className="mt-4 pt-4 border-t border-dashed border-gray-300">
            <p className="text-xs text-gray-500">
              Firma del responsable: _______________________________
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats for Print */}
      <div className="hidden print:block mt-4 text-sm text-gray-600">
        <p>Total de artículos a pickear: <strong>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></p>
        <p>Productos únicos: <strong>{order.items.length}</strong></p>
      </div>
    </div>
  );
}
