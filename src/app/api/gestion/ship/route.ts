import { NextRequest, NextResponse } from 'next/server';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';
import { getEm } from '@/lib/db';
import { StoreShipment } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { isStorePickup } from '@/lib/shipping';
import { requireRole } from '@/lib/session';
import { errorResponse } from '@/lib/http';

// POST /api/gestion/ship - Marcar pedido como enviado (crear shipment)
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const em = await getEm();
    const { orderId, orderDisplayId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId requerido' },
        { status: 400 }
      );
    }

    // Obtener el pedido con fulfillments e items de cada fulfillment y shipping methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderData = await medusaRequest<{ order: any }>(
      `/admin/orders/${orderId}?fields=+fulfillments.*,+fulfillments.items.*,+shipping_methods.*`
    );

    const order = orderData.order;
    const fulfillments = order.fulfillments || [];
    const fulfillmentStatus = order.fulfillment_status || '';
    const shippingMethod = order.shipping_methods?.[0];
    const shippingOptionId = shippingMethod?.shipping_option_id;

    // Verificar si ya fue enviado a tienda (para store pickup)
    if (isStorePickup(shippingOptionId)) {
      const existingShipment = await em.findOne(StoreShipment, { orderId });
      if (existingShipment) {
        return NextResponse.json(
          { success: false, error: 'Este pedido ya fue enviado a la tienda' },
          { status: 400 }
        );
      }
    }

    // Si ya está shipped o delivered en Medusa, no hacer nada
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

    // Para pedidos de RETIRO EN TIENDA: no llamar a Medusa shipment API
    // (Medusa trata pickup shipments como delivered automáticamente).
    // En su lugar, registrar el envío a tienda en MongoDB.
    if (isStorePickup(shippingOptionId)) {
      const storeData = shippingMethod?.data?.store;

      const shipment = em.create(StoreShipment, {
        orderId,
        orderDisplayId: orderDisplayId || 0,
        storeId: storeData?.id || '',
        storeName: storeData?.name || shippingMethod?.name || 'Tienda',
        storeAddress: storeData?.address || '',
        shippedByName: 'Gestión',
        shippedAt: new Date(),
      });
      await em.persistAndFlush(shipment);

      invalidateOrdersCache();

      audit({
        action: 'order_ship_store',
        userName: 'Gestión',
        orderId,
        orderDisplayId: orderDisplayId || 0,
        details: `Pedido #${orderDisplayId || orderId} enviado a tienda ${storeData?.name || ''}`,
        metadata: { storeName: storeData?.name, storeId: storeData?.id },
      });

      return NextResponse.json({ success: true });
    }

    // Para envíos normales: crear shipment en Medusa
    for (const fulfillment of fulfillments) {
      if (fulfillment.shipped_at) continue;

      // Medusa v2 requiere items en el body del shipment (usando line_item_id, no fulfillment item id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shipmentItems = (fulfillment.items || []).map((item: any) => ({
        id: item.line_item_id,
        quantity: item.quantity,
      }));

      await medusaRequest(
        `/admin/orders/${orderId}/fulfillments/${fulfillment.id}/shipments`,
        {
          method: 'POST',
          body: { items: shipmentItems },
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
    return errorResponse(error);
  }
}
