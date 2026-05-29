import { NextResponse } from 'next/server';
import { getAllPaidOrders } from '@/lib/medusa';
import { classifyOrder, type ShippingCategory } from '@/lib/shipping';

// Mapa: categoría dinámica → clave de salida (se mantienen las claves históricas
// para no romper el dashboard; p. ej. 'correo' → 'correo_argentino').
const CATEGORY_TO_KEY: Record<ShippingCategory, string> = {
  factory_pickup: 'factory_pickup',
  store_pickup: 'store_pickup',
  express: 'express',
  correo: 'correo_argentino',
  via_cargo: 'via_cargo',
  expreso_cliente: 'expreso_cliente',
  other: 'unknown',
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

      // Shipping method (clasificado por el nombre del método de envío)
      const shippingKey = CATEGORY_TO_KEY[classifyOrder(order)];
      byShippingMethod[shippingKey]++;
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
