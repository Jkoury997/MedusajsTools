import Link from 'next/link';
import { getPaidOrders, Order } from '@/lib/medusa';
import RefreshButton from '@/components/RefreshButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

function formatPrice(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined || amount === null) return '-';
  // MedusaJS v2 ya devuelve el precio en la unidad correcta (no en centavos)
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string): { label: string; className: string } {
  const statusMap: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
    completed: { label: 'Completado', className: 'bg-green-100 text-green-800' },
    archived: { label: 'Archivado', className: 'bg-gray-100 text-gray-800' },
    canceled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
    requires_action: { label: 'Requiere Acción', className: 'bg-orange-100 text-orange-800' },
  };
  return statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
}

function getFulfillmentBadge(status: string): { label: string; className: string } {
  const statusMap: Record<string, { label: string; className: string }> = {
    not_fulfilled: { label: 'Sin Preparar', className: 'bg-red-100 text-red-800' },
    partially_fulfilled: { label: 'Parcialmente Preparado', className: 'bg-yellow-100 text-yellow-800' },
    fulfilled: { label: 'Preparado', className: 'bg-green-100 text-green-800' },
    partially_shipped: { label: 'Parcialmente Enviado', className: 'bg-blue-100 text-blue-800' },
    shipped: { label: 'Enviado', className: 'bg-blue-100 text-blue-800' },
    partially_returned: { label: 'Parcialmente Devuelto', className: 'bg-purple-100 text-purple-800' },
    returned: { label: 'Devuelto', className: 'bg-purple-100 text-purple-800' },
    canceled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800' },
    requires_action: { label: 'Requiere Acción', className: 'bg-orange-100 text-orange-800' },
  };
  return statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
}

function OrderCard({ order }: { order: Order }) {
  const statusBadge = getStatusBadge(order.status || 'pending');
  const fulfillmentBadge = getFulfillmentBadge(order.fulfillment_status || 'not_fulfilled');
  const items = order.items || [];
  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <Link href={`/pedido/${order.id}`}>
      <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border border-gray-200 hover:border-blue-300">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Pedido #{order.display_id}
            </h2>
            <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">
              {formatPrice(order.total, order.currency_code)}
            </p>
            <p className="text-sm text-gray-500">{totalItems || 0} artículos</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${fulfillmentBadge.className}`}>
            {fulfillmentBadge.label}
          </span>
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Cliente:</span>
            <span className="text-gray-900 font-medium">
              {order.customer
                ? `${order.customer.first_name} ${order.customer.last_name}`
                : order.email}
            </span>
          </div>
          {order.shipping_address && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Dirección:</span>
              <span className="text-gray-900 text-right max-w-[60%]">
                {order.shipping_address.city}, {order.shipping_address.province || order.shipping_address.country_code}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <span className="text-blue-600 text-sm font-medium hover:text-blue-800">
            Ver detalle para pickeo →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  let orders: Order[] = [];
  let error: string | null = null;

  try {
    const response = await getPaidOrders();
    orders = response.orders;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar los pedidos';
    console.error('Error fetching orders:', e);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Pedidos Pagos</h2>
          <p className="text-gray-600">Pedidos listos para preparar</p>
        </div>
        <RefreshButton />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-medium">Error al cargar pedidos</p>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-red-600 text-sm mt-2">
            Verifica que la API Key esté configurada en el archivo .env.local
          </p>
        </div>
      )}

      {!error && orders.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No hay pedidos pagos</h3>
          <p className="mt-1 text-sm text-gray-500">
            Los pedidos pagos aparecerán aquí cuando estén disponibles.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>

      {orders.length > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Mostrando {orders.length} pedido{orders.length !== 1 ? 's' : ''} pago{orders.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
