import Link from 'next/link';
import { getOrderById, Order, LineItem } from '@/lib/medusa';
import PrintButton from './PrintButton';
import PickingInterface from './PickingInterface';
import StoreLabel from './StoreLabel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
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

// Formatea número de teléfono para WhatsApp Argentina
function formatWhatsAppNumber(phone: string): string {
  // Eliminar todo lo que no sea número
  let cleanNumber = phone.replace(/\D/g, '');

  // Si ya empieza con 54, no agregar
  if (cleanNumber.startsWith('54')) {
    return cleanNumber;
  }

  // Si empieza con 0 (ej: 011, 0351), quitar el 0
  if (cleanNumber.startsWith('0')) {
    cleanNumber = cleanNumber.substring(1);
  }

  // Si empieza con 15, es un celular sin código de área, quitar el 15
  // (WhatsApp Argentina no usa el 15)
  if (cleanNumber.startsWith('15')) {
    cleanNumber = cleanNumber.substring(2);
  }

  // Si el número tiene 10 dígitos, agregar 54
  // Si tiene más, probablemente ya tiene el código de país
  if (cleanNumber.length === 10) {
    return `54${cleanNumber}`;
  }

  // Si tiene 8 dígitos (sin código de área), asumir Buenos Aires (11)
  if (cleanNumber.length === 8) {
    return `5411${cleanNumber}`;
  }

  return `54${cleanNumber}`;
}

// Mapeo de códigos de provincia Argentina
function formatProvince(provinceCode: string): string {
  const provinces: Record<string, string> = {
    'ar-c': 'CABA',
    'ar-b': 'Buenos Aires',
    'ar-k': 'Catamarca',
    'ar-h': 'Chaco',
    'ar-u': 'Chubut',
    'ar-x': 'Córdoba',
    'ar-w': 'Corrientes',
    'ar-e': 'Entre Ríos',
    'ar-p': 'Formosa',
    'ar-y': 'Jujuy',
    'ar-l': 'La Pampa',
    'ar-f': 'La Rioja',
    'ar-m': 'Mendoza',
    'ar-n': 'Misiones',
    'ar-q': 'Neuquén',
    'ar-r': 'Río Negro',
    'ar-a': 'Salta',
    'ar-j': 'San Juan',
    'ar-d': 'San Luis',
    'ar-z': 'Santa Cruz',
    'ar-s': 'Santa Fe',
    'ar-g': 'Santiago del Estero',
    'ar-v': 'Tierra del Fuego',
    'ar-t': 'Tucumán',
  };
  return provinces[provinceCode.toLowerCase()] || provinceCode;
}

// Detecta si el envío es retiro en tienda y devuelve datos de la tienda
function getStorePickupInfo(order: Order): { storeName: string; storeAddress: string } | null {
  const methods = order.shipping_methods;
  if (!methods || methods.length === 0) return null;
  const method = methods[0];
  const name = (method.name || '').toLowerCase();
  // Detectar por nombre: "retiro", "tienda", "pickup", "sucursal"
  const isStorePickup = name.includes('retiro') || name.includes('tienda') || name.includes('pickup') || name.includes('sucursal');
  if (!isStorePickup) return null;
  // Intentar obtener datos de la tienda desde data.store
  const store = method.data?.store;
  if (store?.name && store?.address) {
    return { storeName: store.name, storeAddress: store.address };
  }
  // Fallback: usar el nombre del método de envío
  return { storeName: method.name || 'Tienda', storeAddress: '' };
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

// Componente de item compacto para IMPRESIÓN - SIN imagen
function ItemRowPrint({ item, index }: { item: LineItem; index: number }) {
  const code = getItemCode(item);
  const productName = getProductName(item);
  const color = getItemColor(item);
  const size = getItemSize(item);

  return (
    <tr className="border-b border-gray-300">
      <td className="py-1 px-2 text-xs">{productName}</td>
      <td className="py-1 px-2 font-mono font-bold text-xs">{code}</td>
      <td className="py-1 px-2 text-xs text-center">{size || '-'}</td>
      <td className="py-1 px-2 text-xs text-center">{color || '-'}</td>
      <td className="py-1 px-2 text-center font-bold">{item.quantity}</td>
    </tr>
  );
}

function OrderHeader({ order, sortedItems, backUrl }: { order: Order; sortedItems: LineItem[]; backUrl: string }) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* Header para pantalla */}
      <div className="sticky top-0 z-10 bg-white border-b -mx-4 sm:-mx-6 lg:-mx-8 px-4 py-3 print:hidden">
        <div className="flex items-center justify-between">
          <Link href={backUrl} className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="text-center flex-1">
            <h1 className="text-xl font-bold text-gray-900">Pedido #{order.display_id}</h1>
            <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
          </div>

          <PrintButton
            orderId={order.id}
            orderDisplayId={order.display_id}
            orderItems={sortedItems}
            fulfillmentStatus={order.fulfillment_status || 'not_fulfilled'}
          />
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

      {/* Header compacto para IMPRESIÓN */}
      <div className="hidden print:block border-b-2 border-black pb-2 mb-2">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">PEDIDO #{order.display_id}</h1>
          <span className="text-sm">{formatDate(order.created_at)}</span>
        </div>
        <div className="flex gap-4 text-xs mt-1">
          <span><strong>{totalItems}</strong> artículos</span>
          <span><strong>{order.items.length}</strong> productos</span>
          <span><strong>{formatPrice(order.total)}</strong></span>
        </div>
      </div>
    </>
  );
}

function getCustomerName(order: Order): string {
  // Intentar obtener nombre del customer
  if (order.customer?.first_name && order.customer?.last_name) {
    return `${order.customer.first_name} ${order.customer.last_name}`;
  }
  if (order.customer?.first_name) {
    return order.customer.first_name;
  }
  // Intentar desde shipping_address
  if (order.shipping_address?.first_name && order.shipping_address?.last_name) {
    return `${order.shipping_address.first_name} ${order.shipping_address.last_name}`;
  }
  if (order.shipping_address?.first_name) {
    return order.shipping_address.first_name;
  }
  // Fallback al email (puede estar en order.email o en customer.email)
  return order.email || order.customer?.email || 'Sin nombre';
}

function CustomerInfo({ order }: { order: Order }) {
  const customerName = getCustomerName(order);
  const email = order.email || order.customer?.email;
  const showEmail = customerName !== email && email;

  return (
    <>
      {/* Info cliente para pantalla - Acordeón colapsado */}
      <details className="bg-gray-50 rounded-xl mb-4 print:hidden group">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-900 truncate">{customerName}</span>
            {order.shipping_address?.phone && (
              <span className="text-xs text-gray-500 hidden sm:inline">· {order.shipping_address.phone}</span>
            )}
          </div>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>

        <div className="px-4 pb-4 space-y-2 border-t border-gray-200 pt-3">
          {/* Email */}
          {showEmail && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-gray-600 truncate">{email}</span>
            </div>
          )}

          {/* Dirección */}
          {order.shipping_address && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900">{order.shipping_address.address_1}</p>
                {order.shipping_address.metadata?.floor && (
                  <p>Piso: {order.shipping_address.metadata.floor}{order.shipping_address.metadata.apartment && ` - Depto: ${order.shipping_address.metadata.apartment}`}</p>
                )}
                <p>
                  {order.shipping_address.city}
                  {order.shipping_address.province && `, ${formatProvince(order.shipping_address.province)}`}
                </p>
                <p>CP: {order.shipping_address.postal_code}</p>
              </div>
            </div>
          )}

          {/* DNI */}
          {order.shipping_address?.metadata?.dni && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
              <span className="text-sm text-gray-600">DNI: {order.shipping_address.metadata.dni}</span>
            </div>
          )}

          {/* WhatsApp */}
          {order.shipping_address?.phone && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <a
                href={`https://wa.me/${formatWhatsAppNumber(order.shipping_address.phone)}?text=Hola! Te escribimos de Marcela Koury por tu pedido %23${order.display_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-600 font-medium hover:underline"
              >
                {order.shipping_address.phone}
              </a>
            </div>
          )}
        </div>
      </details>

      {/* Info cliente compacta para IMPRESIÓN */}
      <div className="hidden print:block text-xs border border-gray-400 p-2 mb-2">
        <div className="flex justify-between">
          <div>
            <strong>{customerName}</strong>
            {order.shipping_address?.phone && <span className="ml-2">Tel: {order.shipping_address.phone}</span>}
          </div>
          {order.shipping_address?.metadata?.dni && <span>DNI: {order.shipping_address.metadata.dni}</span>}
        </div>
        {order.shipping_address && (
          <div className="mt-1">
            {order.shipping_address.address_1}
            {order.shipping_address.metadata?.floor && ` - Piso ${order.shipping_address.metadata.floor}`}
            {order.shipping_address.metadata?.apartment && ` Depto ${order.shipping_address.metadata.apartment}`}
            {' - '}{order.shipping_address.city}
            {order.shipping_address.province && `, ${formatProvince(order.shipping_address.province)}`}
            {' - CP '}{order.shipping_address.postal_code}
          </div>
        )}
      </div>
    </>
  );
}

export default async function OrderDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;

  // Construir URL de retorno con el estado
  const backUrl = from ? `/?estado=${from}` : '/';

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
            href={backUrl}
            className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            ← Volver
          </Link>
        </div>
      </div>
    );
  }

  // Ordenar items alfabéticamente por nombre de producto, luego por talle
  const sortedItems = [...order.items].sort((a, b) => {
    const nameA = getProductName(a).toLowerCase();
    const nameB = getProductName(b).toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    const sizeA = getItemSize(a) || '';
    const sizeB = getItemSize(b) || '';
    return sizeA.localeCompare(sizeB);
  });

  return (
    <div className="min-h-screen pb-6">
      <OrderHeader order={order} sortedItems={sortedItems} backUrl={backUrl} />

      <div className="mt-4">
        <CustomerInfo order={order} />

        {/* Lista de artículos - Vista IMPRESIÓN (tabla compacta) */}
        <div className="hidden print:block">
          <table className="w-full text-xs border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-1 px-2 border border-gray-400">Nombre</th>
                <th className="py-1 px-2 border border-gray-400 w-20">Código</th>
                <th className="py-1 px-2 border border-gray-400 w-12">Talle</th>
                <th className="py-1 px-2 border border-gray-400 w-16">Color</th>
                <th className="py-1 px-2 border border-gray-400 w-10">Cant</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, index) => (
                <ItemRowPrint key={item.id} item={item} index={index} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Lista de artículos en pantalla - solo cuando NO hay picking (pedidos ya preparados/enviados) */}
        {(order.fulfillment_status === 'fulfilled' || order.fulfillment_status === 'shipped' || order.fulfillment_status === 'partially_shipped') && (
          <div className="print:hidden space-y-2 mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-2">
              Artículos ({sortedItems.reduce((sum, item) => sum + item.quantity, 0)})
            </h3>
            {sortedItems.map((item) => {
              const productName = getProductName(item);
              const code = getItemCode(item);
              const color = getItemColor(item);
              const size = getItemSize(item);
              const thumbnail = item.variant?.product?.thumbnail;

              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex gap-3">
                    {thumbnail && (
                      <img
                        src={thumbnail}
                        alt={productName}
                        className="w-14 h-14 object-cover rounded-lg border flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">{productName}</p>
                      <p className="text-xs text-gray-500 font-mono">{code}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {size && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{size}</span>
                        )}
                        {color && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">{color}</span>
                        )}
                        <span className="text-xs font-bold text-gray-700 ml-auto">x{item.quantity}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Etiqueta de Tienda - solo para pedidos preparados con retiro en tienda */}
        {(order.fulfillment_status === 'fulfilled' || order.fulfillment_status === 'shipped' || order.fulfillment_status === 'partially_shipped') && (() => {
          const storeInfo = getStorePickupInfo(order);
          if (!storeInfo) return null;
          return (
            <div className="print:hidden mb-4">
              <StoreLabel
                orderDisplayId={order.display_id}
                customerName={getCustomerName(order)}
                customerPhone={order.shipping_address?.phone || null}
                storeName={storeInfo.storeName}
                storeAddress={storeInfo.storeAddress}
              />
            </div>
          );
        })()}

        {/* Picking Interface */}
        <PickingInterface
          orderId={order.id}
          orderDisplayId={order.display_id}
          orderItems={sortedItems}
          fulfillmentStatus={order.fulfillment_status || 'not_fulfilled'}
        />
      </div>

      {/* Print Footer */}
      <div className="hidden print:block mt-4 pt-2 border-t border-gray-300">
        <div className="flex justify-between text-xs text-gray-600">
          <span>Pedido #{order.display_id} - {order.items.reduce((sum, item) => sum + item.quantity, 0)} artículos</span>
          <span>{new Date().toLocaleDateString('es-AR')}</span>
        </div>
        <div className="mt-3 flex justify-between">
          <p className="text-xs text-gray-500">
            Preparó: ___________________
          </p>
          <p className="text-xs text-gray-500">
            Firma: ___________________
          </p>
        </div>
      </div>
    </div>
  );
}
