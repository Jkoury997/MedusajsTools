import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, StoreDelivery, audit } from '@/lib/mongodb/models';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';

// POST /api/picking/deliver - Marcar pedido como entregado en tienda
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { orderId, orderDisplayId, userId } = await req.json();

    if (!orderId || !userId) {
      return NextResponse.json(
        { success: false, error: 'orderId y userId son requeridos' },
        { status: 400 }
      );
    }

    // Validar que sea un usuario de tienda activo
    const user = await PickingUser.findById(userId);
    if (!user || !user.active || user.role !== 'store') {
      return NextResponse.json(
        { success: false, error: 'Usuario no autorizado' },
        { status: 401 }
      );
    }

    // Verificar que no se haya entregado ya
    const existing = await StoreDelivery.findOne({ orderId });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Este pedido ya fue entregado el ${existing.deliveredAt.toLocaleDateString('es-AR')} por ${existing.deliveredByName}` },
        { status: 400 }
      );
    }

    // Crear shipment en Medusa (marca como shipped)
    let shipmentCreated = false;
    let shipmentError = '';

    try {
      // Obtener el pedido para tener los fulfillments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderData = await medusaRequest<{ order: any }>(
        `/admin/orders/${orderId}?fields=+fulfillments.*,+fulfillments.items.*`
      );

      const order = orderData.order;
      const fulfillments = order.fulfillments || [];

      if (fulfillments.length === 0) {
        shipmentError = 'No hay fulfillments para crear shipment';
      } else {
        // Crear shipment para el primer fulfillment
        const fulfillment = fulfillments[0];
        await medusaRequest(`/admin/orders/${orderId}/fulfillments/${fulfillment.id}/shipments`, {
          method: 'POST',
          body: {
            items: fulfillment.items?.map((item: { id: string; quantity: number }) => ({
              id: item.id,
              quantity: item.quantity,
            })) || [],
          },
        });
        shipmentCreated = true;
      }
    } catch (error) {
      shipmentError = error instanceof Error ? error.message : 'Error al crear shipment en Medusa';
      console.error('[deliver] Medusa shipment error:', error);
    }

    // Registrar entrega en MongoDB
    const delivery = await StoreDelivery.create({
      orderId,
      orderDisplayId: orderDisplayId || 0,
      storeId: user.storeId || '',
      storeName: user.storeName || '',
      deliveredByUserId: user._id,
      deliveredByName: user.name,
      deliveredAt: new Date(),
      shipmentCreated,
    });

    // Invalidar cache de pedidos
    invalidateOrdersCache();

    // Audit log
    audit({
      action: 'order_deliver',
      userName: user.name,
      userId: user._id.toString(),
      orderId,
      orderDisplayId,
      details: `Pedido #${orderDisplayId} entregado en tienda ${user.storeName} por ${user.name}${shipmentCreated ? '' : ` (shipment error: ${shipmentError})`}`,
      metadata: { storeId: user.storeId, storeName: user.storeName, shipmentCreated, shipmentError: shipmentError || undefined },
    });

    return NextResponse.json({
      success: true,
      delivery: {
        id: delivery._id,
        deliveredAt: delivery.deliveredAt,
        deliveredByName: delivery.deliveredByName,
        storeName: delivery.storeName,
        shipmentCreated,
        shipmentError: shipmentError || undefined,
      },
    });
  } catch (error) {
    console.error('[deliver] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al marcar como entregado' },
      { status: 500 }
    );
  }
}
