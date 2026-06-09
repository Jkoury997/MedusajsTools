import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession, StoreShipment } from '@/lib/entities';
import { getAllPaidOrders, isCashPayment, isMercadoLibreOrder } from '@/lib/medusa';
import { classifyOrder } from '@/lib/shipping';

// GET /api/gestion?tab=por-preparar|preparados|faltantes|por-enviar|enviados
export async function GET(req: NextRequest) {
  try {
    const tab = req.nextUrl.searchParams.get('tab') || 'por-preparar';

    const em = await getEm();

    // Obtener todos los pedidos pagados de Medusa
    const allOrders = await getAllPaidOrders();

    // Obtener todas las sesiones (completadas + en progreso)
    const allSessions = await em.find(
      PickingSession,
      { status: { $in: ['completed', 'in_progress'] } },
      { populate: ['items'] }
    );

    const completedSessionMap = new Map<string, any>();
    const inProgressSessionMap = new Map<string, any>();
    for (const s of allSessions) {
      if (s.status === 'completed') {
        completedSessionMap.set(s.orderId, s);
      } else if (s.status === 'in_progress') {
        inProgressSessionMap.set(s.orderId, s);
      }
    }

    // Obtener todos los envíos a tienda (StoreShipment) para saber qué pedidos fueron enviados a tienda
    const allStoreShipments = await em.find(StoreShipment, {});
    const storeShipmentMap = new Map<string, any>();
    for (const ss of allStoreShipments) {
      storeShipmentMap.set(ss.orderId, ss);
    }

    // Clasificar pedidos
    const results: any[] = [];

    for (const order of allOrders) {
      const completedSession = completedSessionMap.get(order.id);
      const inProgressSession = inProgressSessionMap.get(order.id);
      const storeShipment = storeShipmentMap.get(order.id);
      const fulfillmentStatus = order.fulfillment_status || 'not_fulfilled';

      // Clasificación única del envío (por nombre del método)
      const shippingMethod = order.shipping_methods?.[0];
      const shippingName = shippingMethod?.name || '';
      const shippingCategory = classifyOrder(order);
      const isExpress = shippingCategory === 'express';
      const isStorePickup = shippingCategory === 'store_pickup';
      const storeData = shippingMethod?.data?.store;
      const customerPhone = order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone || null;
      const cashPayment = isCashPayment(order);

      // Para retiro en tienda: determinar si fue enviado a tienda (via MongoDB)
      const isSentToStore = isStorePickup && !!storeShipment;

      // Timestamps reales de despacho (para agrupar la tab Enviados por fecha).
      const fulfillments: { shipped_at?: string | null; delivered_at?: string | null }[] = order.fulfillments || [];
      const shippedAt = fulfillments.map((f) => f.shipped_at).filter(Boolean).sort().pop() || null;
      const deliveredAt = fulfillments.map((f) => f.delivered_at).filter(Boolean).sort().pop() || null;

      const orderData: Record<string, any> = {
        id: order.id,
        displayId: order.display_id,
        email: order.email,
        total: order.total,
        createdAt: order.created_at,
        customerName: order.customer?.first_name && order.customer?.last_name
          ? `${order.customer.first_name} ${order.customer.last_name}`
          : order.shipping_address?.first_name && order.shipping_address?.last_name
            ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}`
            : order.email || order.customer?.email || 'Sin nombre',
        address: order.shipping_address
          ? `${order.shipping_address.address_1}, ${order.shipping_address.city}`
          : null,
        province: order.shipping_address?.province || null,
        fulfillmentStatus,
        shippingMethod: shippingName || null,
        isExpress,
        itemCount: (order.items || []).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0),
        isStorePickup,
        isSentToStore,
        customerPhone,
        storeName: isStorePickup ? (storeData?.name || shippingName || 'Tienda') : null,
        storeAddress: isStorePickup ? (storeData?.address || '') : null,
        isCashPayment: cashPayment,
        // Mercado Libre: indica si la orden viene de ML para mostrar badge y etiqueta
        isMercadoLibre: isMercadoLibreOrder(order),
        mlShipmentId: order.metadata?.ml_shipment_id || null,
        mlOrderId: order.metadata?.ml_order_id || null,
        mlShipmentStatus: order.metadata?.ml_shipment_status || null,
        mlTrackingNumber: order.metadata?.ml_tracking_number || null,
        sentToStoreAt: storeShipment?.shippedAt || null,
        // Para la tab Enviados: fecha real de despacho + DNI de quien retira.
        shippedAt,
        deliveredAt,
        dni: order.shipping_address?.metadata?.dni || null,
        session: completedSession ? {
          totalRequired: completedSession.totalRequired,
          totalPicked: completedSession.totalPicked,
          totalMissing: completedSession.totalMissing,
          packed: completedSession.packed,
          packedAt: completedSession.packedAt,
          userName: completedSession.userName,
          completedAt: completedSession.completedAt,
          durationSeconds: completedSession.durationSeconds,
          faltanteResolution: completedSession.faltanteResolution,
          faltanteResolvedAt: completedSession.faltanteResolvedAt,
          faltanteNotes: completedSession.faltanteNotes,
          voucherCode: completedSession.voucherCode,
          voucherValue: completedSession.voucherValue,
          missingItems: completedSession.items.getItems()
            .filter((i: any) => {
              const missing = i.quantityMissing || 0;
              const received = i.quantityReceived || 0;
              // Solo mostrar items que aún no fueron recibidos completamente
              return missing > 0 && received < missing;
            })
            .map((i: any) => {
              const medusaItem = order.items?.find((oi: any) => oi.id === i.lineItemId);
              const remaining = (i.quantityMissing || 0) - (i.quantityReceived || 0);
              return {
                lineItemId: i.lineItemId,
                sku: i.sku,
                barcode: i.barcode,
                // external_id del producto = código que se muestra; cae a sku de variante.
                externalId: medusaItem?.variant?.product?.external_id || i.sku || null,
                color: medusaItem?.variant?.metadata?.color || null,
                size: medusaItem?.variant?.metadata?.size || null,
                quantityRequired: i.quantityRequired,
                quantityPicked: i.quantityPicked,
                quantityMissing: remaining,
                unitPrice: medusaItem?.unit_price || 0,
              };
            }) || [],
        } : null,
        // Info de sesión en progreso (para tab por-preparar)
        inProgressSession: inProgressSession ? {
          userName: inProgressSession.userName,
          totalRequired: inProgressSession.totalRequired,
          totalPicked: inProgressSession.totalPicked,
          progressPercent: inProgressSession.totalRequired > 0
            ? Math.round((inProgressSession.totalPicked / inProgressSession.totalRequired) * 100)
            : 0,
          startedAt: inProgressSession.startedAt,
        } : null,
      };

      switch (tab) {
        case 'por-preparar':
          // Pedidos no preparados: not_fulfilled o partially_fulfilled, sin sesión completada
          if (['not_fulfilled', 'partially_fulfilled'].includes(fulfillmentStatus) && !completedSession) {
            results.push(orderData);
          }
          break;

        case 'faltantes':
          // Pedidos con faltantes no resueltos (pending o esperando mercadería)
          if (completedSession && completedSession.totalMissing > 0 && ['pending', 'waiting'].includes(completedSession.faltanteResolution)) {
            results.push(orderData);
          }
          break;

        case 'por-enviar':
          // Pedidos fulfilled o partially_fulfilled, sin faltantes sin resolver, listos para enviar
          // Excluir pedidos de retiro en tienda que ya fueron enviados a tienda
          if (['fulfilled', 'partially_fulfilled'].includes(fulfillmentStatus) && completedSession) {
            const hasUnresolvedFaltantes = completedSession.totalMissing > 0 && ['pending', 'waiting'].includes(completedSession.faltanteResolution);
            if (!hasUnresolvedFaltantes && !isSentToStore) {
              results.push(orderData);
            }
          }
          break;

        case 'enviados':
          // Pedidos enviados (NO entregados):
          // 1. Envíos normales con status shipped/partially_shipped en Medusa
          // 2. Retiro en tienda que fueron enviados a tienda (tracked en MongoDB, Medusa sigue en fulfilled)
          if (['shipped', 'partially_shipped'].includes(fulfillmentStatus)) {
            results.push(orderData);
          } else if (isSentToStore && ['fulfilled', 'partially_fulfilled'].includes(fulfillmentStatus)) {
            // Retiro en tienda enviado: Medusa sigue en fulfilled pero MongoDB tiene StoreShipment
            results.push(orderData);
          }
          break;
      }
    }

    // Ordenar: express primero, luego por fecha (más viejo primero)
    results.sort((a, b) => {
      if (a.isExpress && !b.isExpress) return -1;
      if (!a.isExpress && b.isExpress) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Contar para badges
    const counts: Record<string, number> = { 'por-preparar': 0, faltantes: 0, 'por-enviar': 0, enviados: 0 };
    for (const order of allOrders) {
      const completedSession = completedSessionMap.get(order.id);
      const orderStoreShipment = storeShipmentMap.get(order.id);
      const fs = order.fulfillment_status || 'not_fulfilled';

      // Detectar si es retiro en tienda (misma clasificación que el loop de arriba)
      const orderIsStorePickup = classifyOrder(order) === 'store_pickup';
      const orderIsSentToStore = orderIsStorePickup && !!orderStoreShipment;

      // Cada badge usa EXACTAMENTE la misma condición que su lista en el switch
      // de arriba, para que el contador coincida con lo que se ve al entrar.
      // Importante: el faltante NO depende del fulfillment_status — un pedido con
      // sesión completada y faltante sin resolver cuenta aunque siga not_fulfilled.
      const hasUnresolvedFaltantes = !!completedSession
        && completedSession.totalMissing > 0
        && ['pending', 'waiting'].includes(completedSession.faltanteResolution);

      if (['not_fulfilled', 'partially_fulfilled'].includes(fs) && !completedSession) {
        counts['por-preparar']++;
      }
      if (hasUnresolvedFaltantes) {
        counts.faltantes++;
      }
      if (['fulfilled', 'partially_fulfilled'].includes(fs) && completedSession && !hasUnresolvedFaltantes && !orderIsSentToStore) {
        counts['por-enviar']++;
      }
      if (['shipped', 'partially_shipped'].includes(fs) || (orderIsSentToStore && ['fulfilled', 'partially_fulfilled'].includes(fs))) {
        counts.enviados++;
      }
    }

    return NextResponse.json({ success: true, orders: results, counts });
  } catch (error) {
    console.error('[Gestion API] Error:', error);
    return NextResponse.json({ success: false, error: 'Error al cargar datos' }, { status: 500 });
  }
}
