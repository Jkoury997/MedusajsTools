import Link from 'next/link';
import { Suspense } from 'react';
import { getPaidOrders, Order, FulfillmentFilter } from '@/lib/medusa';
import RefreshButton from '@/components/RefreshButton';
import OrderTabs from '@/components/OrderTabs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ estado?: string }>;
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

function getFulfillmentBadge(status: string): { label: string; className: string } {
  const statusMap: Record<string, { label: string; className: string }> = {
    not_fulfilled: { label: 'Sin Preparar', className: 'bg-red-500 text-white' },
    partially_fulfilled: { label: 'Parcial', className: 'bg-yellow-500 text-white' },
    fulfilled: { label: 'Preparado', className: 'bg-green-500 text-white' },
    partially_shipped: { label: 'Enviando', className: 'bg-blue-500 text-white' },
    shipped: { label: 'Enviado', className: 'bg-blue-600 text-white' },
    canceled: { label: 'Cancelado', className: 'bg-gray-500 text-white' },
  };
  return statusMap[status] || { label: status || 'Pendiente', className: 'bg-gray-500 text-white' };
}

function getTabTitle(estado: FulfillmentFilter): string {
  const titles: Record<FulfillmentFilter, string> = {
    preparar: 'Para Preparar',
    enviar: 'Para Enviar',
    enviados: 'Enviados',
  };
  return titles[estado] || 'Pedidos';
}

function OrderCard({ order, estado }: { order: Order; estado: FulfillmentFilter }) {
  const fulfillmentBadge = getFulfillmentBadge(order.fulfillment_status || 'not_fulfilled');
  const items = order.items || [];
  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <Link href={`/pedido/${order.id}?from=${estado}`} className="block">
      <div className="bg-white rounded-xl shadow-sm active:shadow-md transition-all border border-gray-100 overflow-hidden">
        {/* Header con número de pedido y estado */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">#{order.display_id}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${fulfillmentBadge.className}`}>
              {fulfillmentBadge.label}
            </span>
          </div>
          <span className="text-lg font-bold text-green-600">
            {formatPrice(order.total)}
          </span>
        </div>

        {/* Contenido principal */}
        <div className="px-4 py-3">
          {/* Cliente */}
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-900 truncate">
              {order.customer?.first_name && order.customer?.last_name
                ? `${order.customer.first_name} ${order.customer.last_name}`
                : order.shipping_address?.first_name && order.shipping_address?.last_name
                  ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}`
                  : order.email || order.customer?.email || 'Sin nombre'}
            </span>
          </div>

          {/* Dirección */}
          {order.shipping_address && (
            <div className="flex items-start gap-2 mb-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-gray-600 line-clamp-1">
                {order.shipping_address.city}, {order.shipping_address.province || order.shipping_address.country_code}
              </span>
            </div>
          )}

          {/* Fecha y cantidad */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">{formatDate(order.created_at)}</span>
            <div className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-full">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-sm font-bold text-blue-600">{totalItems}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function LoadingCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <div className="h-6 bg-gray-200 rounded w-24"></div>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const estado = (params.estado as FulfillmentFilter) || 'preparar';

  let orders: Order[] = [];
  let error: string | null = null;

  try {
    const response = await getPaidOrders(50, 0, estado);
    orders = response.orders;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar los pedidos';
    console.error('Error fetching orders:', e);
  }

  const title = getTabTitle(estado);

  return (
    <div className="min-h-screen">
      {/* Header sticky en mobile */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <RefreshButton />
        </div>

        {/* Pestañas */}
        <Suspense fallback={<div className="h-10" />}>
          <OrderTabs />
        </Suspense>
      </div>

      <div className="mt-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-800 font-medium text-sm">Error al cargar pedidos</p>
            <p className="text-red-600 text-xs mt-1">{error}</p>
          </div>
        )}

        {!error && orders.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay pedidos</h3>
            <p className="mt-1 text-xs text-gray-500">No hay pedidos en este estado</p>
          </div>
        )}

        {/* Grid de pedidos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} estado={estado} />
          ))}
        </div>
      </div>
    </div>
  );
}
