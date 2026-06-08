import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { PickingWave } from '@/lib/entities';
import { getOrderById, isCashPayment, isMercadoLibreOrder } from '@/lib/medusa';
import type { Order } from '@/lib/medusa';
import { isStorePickup, getShippingLabel } from '@/lib/shipping';
import type { WaveLabelData } from '@/lib/wave-label';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function customerName(order: Order): string {
  if (order.customer?.first_name && order.customer?.last_name) {
    return `${order.customer.first_name} ${order.customer.last_name}`;
  }
  if (order.customer?.first_name) return order.customer.first_name;
  if (order.shipping_address?.first_name && order.shipping_address?.last_name) {
    return `${order.shipping_address.first_name} ${order.shipping_address.last_name}`;
  }
  if (order.shipping_address?.first_name) return order.shipping_address.first_name;
  return order.email || order.customer?.email || 'Sin nombre';
}

/** Destino legible: tienda de retiro o método/transportista + dirección. */
function destination(order: Order): Pick<WaveLabelData, 'destinationKind' | 'destinationName' | 'destinationAddress'> {
  const method = order.shipping_methods?.[0];
  if (isStorePickup(method?.name)) {
    const store = method?.data?.store;
    return {
      destinationKind: 'tienda',
      destinationName: store?.name || method?.name || 'Tienda',
      destinationAddress: store?.address || '',
    };
  }
  const addr = order.shipping_address;
  const parts = addr
    ? [addr.address_1, addr.city, addr.province].filter(Boolean).join(', ')
    : '';
  return {
    destinationKind: 'envio',
    destinationName: getShippingLabel(method?.name) || method?.name || 'Envío',
    destinationAddress: parts,
  };
}

// GET /api/picking/waves/:id/labels - Datos de etiqueta de envío de cada pedido de
// la ola (con su letra de mesa) para imprimir todas juntas o una por una.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requireSession();
    const em = await getEm();
    const { id } = await params;

    const wave = await em.findOne(PickingWave, { id }, { populate: ['orders'] });
    if (!wave) throw new HttpError(404, 'Ola no encontrada');

    const stationLabel = wave.stationId.replace('mesa-', 'Mesa ');
    const orders = wave.orders.getItems().sort((a, b) => a.letter.localeCompare(b.letter));

    const labels: WaveLabelData[] = await Promise.all(
      orders.map(async (o) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const order = (await getOrderById(o.orderId)).order as any as Order;
          const phone =
            order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone || null;
          return {
            letter: o.letter,
            orderId: o.orderId,
            orderDisplayId: o.orderDisplayId,
            customerName: customerName(order),
            customerPhone: phone,
            ...destination(order),
            isCash: isCashPayment(order),
            orderTotal: order.total,
            isML: isMercadoLibreOrder(order),
            mlShipmentId: order.metadata?.ml_shipment_id ?? null,
            mlTracking: order.metadata?.ml_tracking_number ?? null,
            waveNumber: wave.displayNumber,
            stationLabel,
          } satisfies WaveLabelData;
        } catch {
          // Si Medusa falla para este pedido, igual emitimos una etiqueta mínima
          // (letra + número) para no romper la impresión del resto de la ola.
          return {
            letter: o.letter,
            orderId: o.orderId,
            orderDisplayId: o.orderDisplayId,
            customerName: 'Sin datos',
            customerPhone: null,
            destinationKind: 'envio',
            destinationName: 'Envío',
            destinationAddress: '',
            isCash: false,
            isML: false,
            mlShipmentId: null,
            mlTracking: null,
            waveNumber: wave.displayNumber,
            stationLabel,
          } satisfies WaveLabelData;
        }
      })
    );

    return NextResponse.json({ success: true, labels });
  } catch (error) {
    return errorResponse(error);
  }
}
