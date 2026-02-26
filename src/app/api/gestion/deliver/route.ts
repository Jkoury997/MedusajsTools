import { NextRequest, NextResponse } from 'next/server';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';
import { connectDB } from '@/lib/mongodb/connection';
import { audit } from '@/lib/mongodb/models';

// POST /api/gestion/deliver - Marcar pedido como entregado
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

    if (fulfillmentStatus === 'delivered') {
      return NextResponse.json(
        { success: false, error: 'Este pedido ya fue entregado' },
        { status: 400 }
      );
    }

    if (fulfillments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay fulfillments para marcar como entregado' },
        { status: 400 }
      );
    }

    // Marcar cada fulfillment como delivered
    for (const fulfillment of fulfillments) {
      if (fulfillment.delivered_at) continue;

      await medusaRequest(
        `/admin/orders/${orderId}/fulfillments/${fulfillment.id}/mark-as-delivered`,
        {
          method: 'POST',
          body: {},
        }
      );
    }

    invalidateOrdersCache();

    audit({
      action: 'order_deliver',
      userName: 'Gestión',
      orderId,
      orderDisplayId: orderDisplayId || 0,
      details: `Pedido #${orderDisplayId || orderId} marcado como entregado`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Deliver API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error al marcar como entregado' },
      { status: 500 }
    );
  }
}
