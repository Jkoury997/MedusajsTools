import { NextResponse } from 'next/server';
import { getAllPaidOrders } from '@/lib/medusa';
import { SHIPPING_OPTIONS } from '@/lib/shipping';

// Mapa inverso: shipping_option_id → nombre legible
const SHIPPING_ID_TO_KEY: Record<string, string> = {
  [SHIPPING_OPTIONS.FACTORY_PICKUP]: 'factory_pickup',
  [SHIPPING_OPTIONS.STORE_PICKUP]: 'store_pickup',
  [SHIPPING_OPTIONS.EXPRESS]: 'express',
  [SHIPPING_OPTIONS.CORREO_ARGENTINO]: 'correo_argentino',
  [SHIPPING_OPTIONS.VIA_CARGO]: 'via_cargo',
  [SHIPPING_OPTIONS.EXPRESO_CLIENTE]: 'expreso_cliente',
};

// GET /api/stats/orders - Stats de órdenes desde Medusa
export async function GET() {
  try {
    const orders = await getAllPaidOrders();

    // Contadores por fulfillment status
    const byFulfillmentStatus: Record<string, number> = {
      not_fulfilled: 0,
      partially_fulfilled: 0,
      fulfilled: 0,
      shipped: 0,
      partially_shipped: 0,
      delivered: 0,
    };

    // Contadores por método de envío
    const byShippingMethod: Record<string, number> = {
      factory_pickup: 0,
      store_pickup: 0,
      express: 0,
      correo_argentino: 0,
      via_cargo: 0,
      expreso_cliente: 0,
      unknown: 0,
    };

    for (const order of orders) {
      // Fulfillment status
      const fStatus = order.fulfillment_status || 'not_fulfilled';
      if (fStatus in byFulfillmentStatus) {
        byFulfillmentStatus[fStatus]++;
      } else {
        byFulfillmentStatus[fStatus] = (byFulfillmentStatus[fStatus] || 0) + 1;
      }

      // Shipping method
      const shippingOptionId = order.shipping_methods?.[0]?.shipping_option_id;
      const shippingKey = shippingOptionId ? SHIPPING_ID_TO_KEY[shippingOptionId] : null;
      if (shippingKey) {
        byShippingMethod[shippingKey]++;
      } else {
        byShippingMethod.unknown++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders: {
        totalPaid: orders.length,
        byFulfillmentStatus,
        byShippingMethod,
        pendingPicking: byFulfillmentStatus.not_fulfilled + byFulfillmentStatus.partially_fulfilled,
        readyToShip: byFulfillmentStatus.fulfilled,
        shipped: byFulfillmentStatus.shipped + byFulfillmentStatus.partially_shipped,
        delivered: byFulfillmentStatus.delivered,
      },
    });
  } catch (error) {
    console.error('[Stats Orders] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener stats de órdenes' },
      { status: 500 }
    );
  }
}
