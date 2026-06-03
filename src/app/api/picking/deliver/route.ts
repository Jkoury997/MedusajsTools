import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User, StoreDelivery, StoreShipment } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';
import { isFactoryPickup, isStorePickup as checkStorePickup } from '@/lib/shipping';
import { requireSession } from '@/lib/session';
import { errorResponse } from '@/lib/http';

// POST /api/picking/deliver - Marcar pedido como entregado en tienda
export async function POST(req: NextRequest) {
  try {
    // Requiere sesión válida (estación logueada). El actor concreto puede venir
    // del body (picker identificado por PIN en una estación compartida) o, si no,
    // ser el propio titular de la sesión (p. ej. usuario tienda por cookie).
    const session = await requireSession();
    const em = await getEm();
    const { orderId, orderDisplayId, userId: bodyUserId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId es requerido' },
        { status: 400 }
      );
    }

    const actingId: string = bodyUserId || session.userId;

    // Validar actor: acepta store, ecommerce, picker (solo fábrica) o admin
    let userName = 'Admin';
    let userRole = 'admin';
    let userStoreId = '';
    let userStoreName = '';
    let actorRef: User | undefined;

    if (actingId === 'admin') {
      userName = 'Admin';
      userRole = 'admin';
    } else {
      const user = await em.findOne(User, { id: actingId });
      if (!user || !user.active || (user.role !== 'store' && user.role !== 'picker' && user.role !== 'ecommerce')) {
        return NextResponse.json(
          { success: false, error: 'Usuario no autorizado' },
          { status: 401 }
        );
      }
      userName = user.name;
      userRole = user.role;
      userStoreId = user.storeId || '';
      userStoreName = user.storeName || '';
      actorRef = user;
    }

    // Verificar que no se haya entregado ya
    const existing = await em.findOne(StoreDelivery, { orderId });
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

      const methods = orderData.order.shipping_methods || [];
      const method = methods[0];

      // Si es picker, solo puede entregar retiro en fábrica
      if (userRole === 'picker' && !isFactoryPickup(method?.name)) {
        return NextResponse.json(
          { success: false, error: 'Solo podés entregar pedidos de retiro en fábrica' },
          { status: 403 }
        );
      }

      // Para retiro en tienda, verificar que el pedido haya sido enviado a la tienda
      if (checkStorePickup(method?.name)) {
        const storeShipment = await em.findOne(StoreShipment, { orderId });
        if (!storeShipment) {
          return NextResponse.json(
            { success: false, error: 'Este pedido aún no fue enviado a la tienda' },
            { status: 400 }
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

    // Registrar entrega
    const delivery = em.create(StoreDelivery, {
      orderId,
      orderDisplayId: orderDisplayId || 0,
      storeId: userStoreId,
      storeName: userStoreName,
      deliveredBy: actorRef,
      deliveredByName: userName,
      deliveredAt: new Date(),
      shipmentCreated: delivered,
    });
    await em.persistAndFlush(delivery);

    // Invalidar cache de pedidos
    invalidateOrdersCache();

    // Audit log
    audit({
      action: 'order_deliver',
      userName,
      userId: actorRef ? actorRef.id : undefined,
      orderId,
      orderDisplayId,
      details: `Pedido #${orderDisplayId} entregado por ${userName}${userStoreName ? ` en tienda ${userStoreName}` : ''}`,
      metadata: { storeId: userStoreId, storeName: userStoreName, delivered },
    });

    return NextResponse.json({
      success: true,
      delivery: {
        id: delivery.id,
        deliveredAt: delivery.deliveredAt,
        deliveredByName: delivery.deliveredByName,
        storeName: delivery.storeName,
        delivered,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
