import { NextRequest, NextResponse } from 'next/server';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';
import { connectDB } from '@/lib/mongodb/connection';
import { audit } from '@/lib/mongodb/models';

// POST /api/gestion/ship - Marcar pedido como enviado (crear shipment)
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { orderId, orderDisplayId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId requerido' },
        { status: 400 }
      );
    }

    // Obtener el pedido con fulfillments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderData = await medusaRequest<{ order: any }>(
      `/admin/orders/${orderId}?fields=+fulfillments.*`
    );

    const order = orderData.order;
    const fulfillments = order.fulfillments || [];
    const fulfillmentStatus = order.fulfillment_status || '';

    // Si ya está shipped o delivered, no hacer nada
    if (['shipped', 'partially_shipped', 'delivered'].includes(fulfillmentStatus)) {
      return NextResponse.json(
        { success: false, error: 'Este pedido ya fue enviado' },
        { status: 400 }
      );
    }

    if (fulfillments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay fulfillments para enviar' },
        { status: 400 }
      );
    }

    // Crear shipment para cada fulfillment que no tenga uno
    for (const fulfillment of fulfillments) {
      if (fulfillment.shipped_at) continue;

      await medusaRequest(
        `/admin/orders/${orderId}/fulfillments/${fulfillment.id}/shipments`,
        {
          method: 'POST',
          body: {},
        }
      );
    }

    invalidateOrdersCache();

    audit({
      action: 'order_ship',
      userName: 'Gestión',
      orderId,
      orderDisplayId: orderDisplayId || 0,
      details: `Pedido #${orderDisplayId || orderId} marcado como enviado`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Ship API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error al enviar pedido' },
      { status: 500 }
    );
  }
}
