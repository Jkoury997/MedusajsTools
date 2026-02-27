import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, StoreDelivery, audit } from '@/lib/mongodb/models';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';
import { isFactoryPickup } from '@/lib/shipping';

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

    // Validar usuario: acepta store, picker (solo fábrica) o admin
    let userName = 'Admin';
    let userRole = 'admin';
    let userStoreId = '';
    let userStoreName = '';
    let userIdStr = userId;

    if (userId === 'admin') {
      userName = 'Admin';
      userRole = 'admin';
    } else {
      const user = await PickingUser.findById(userId);
      if (!user || !user.active || (user.role !== 'store' && user.role !== 'picker')) {
        return NextResponse.json(
          { success: false, error: 'Usuario no autorizado' },
          { status: 401 }
        );
      }
      userName = user.name;
      userRole = user.role;
      userStoreId = user.storeId || '';
      userStoreName = user.storeName || '';
      userIdStr = user._id.toString();
    }

    // Verificar que no se haya entregado ya
    const existing = await StoreDelivery.findOne({ orderId });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Este pedido ya fue entregado el ${existing.deliveredAt.toLocaleDateString('es-AR')} por ${existing.deliveredByName}` },
        { status: 400 }
      );
    }

    // Marcar como delivered en Medusa
    let delivered = false;
    let deliverError = '';

    try {
      // Obtener el pedido con fulfillments y shipping methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderData = await medusaRequest<{ order: any }>(
        `/admin/orders/${orderId}?fields=+fulfillments.*,+shipping_methods.*`
      );

      // Si es picker, solo puede entregar retiro en fábrica
      if (userRole === 'picker') {
        const methods = orderData.order.shipping_methods || [];
        const method = methods[0];
        if (!isFactoryPickup(method?.shipping_option_id)) {
          return NextResponse.json(
            { success: false, error: 'Solo podés entregar pedidos de retiro en fábrica' },
            { status: 403 }
          );
        }
      }

      const order = orderData.order;
      const fulfillmentStatus = order.fulfillment_status || '';
      const fulfillments = order.fulfillments || [];

      console.log('[deliver] Order ID:', orderId);
      console.log('[deliver] Fulfillment status:', fulfillmentStatus);
      console.log('[deliver] Fulfillments count:', fulfillments.length);

      // Si ya está delivered, no hacer nada
      if (fulfillmentStatus === 'delivered') {
        console.log('[deliver] Pedido ya está delivered');
        delivered = true;
      } else if (fulfillments.length === 0) {
        deliverError = 'No hay fulfillments para marcar como entregado';
      } else {
        // Marcar cada fulfillment como delivered
        for (const fulfillment of fulfillments) {
          if (fulfillment.delivered_at) {
            console.log('[deliver] Fulfillment', fulfillment.id, 'ya está delivered');
            continue;
          }
          console.log('[deliver] Marcando fulfillment', fulfillment.id, 'como delivered');
          await medusaRequest(`/admin/orders/${orderId}/fulfillments/${fulfillment.id}/mark-as-delivered`, {
            method: 'POST',
            body: {},
          });
        }
        delivered = true;
      }
    } catch (error) {
      deliverError = error instanceof Error ? error.message : 'Error al marcar como entregado en Medusa';
      console.error('[deliver] Medusa error:', error);
    }

    // Si no se pudo marcar en Medusa, no permitir la entrega
    if (!delivered) {
      return NextResponse.json(
        { success: false, error: `No se pudo marcar como entregado en Medusa: ${deliverError}` },
        { status: 500 }
      );
    }

    // Registrar entrega en MongoDB
    const delivery = await StoreDelivery.create({
      orderId,
      orderDisplayId: orderDisplayId || 0,
      storeId: userStoreId,
      storeName: userStoreName,
      deliveredByUserId: userIdStr,
      deliveredByName: userName,
      deliveredAt: new Date(),
      shipmentCreated: delivered,
    });

    // Invalidar cache de pedidos
    invalidateOrdersCache();

    // Audit log
    audit({
      action: 'order_deliver',
      userName,
      userId: userIdStr,
      orderId,
      orderDisplayId,
      details: `Pedido #${orderDisplayId} entregado por ${userName}${userStoreName ? ` en tienda ${userStoreName}` : ''}`,
      metadata: { storeId: userStoreId, storeName: userStoreName, delivered },
    });

    return NextResponse.json({
      success: true,
      delivery: {
        id: delivery._id,
        deliveredAt: delivery.deliveredAt,
        deliveredByName: delivery.deliveredByName,
        storeName: delivery.storeName,
        delivered,
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
