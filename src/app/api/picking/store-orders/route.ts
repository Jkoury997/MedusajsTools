import { NextRequest, NextResponse } from 'next/server';
import { getPaidOrders } from '@/lib/medusa';
import { getEm } from '@/lib/db';
import { StoreDelivery, User } from '@/lib/entities';
import { requireSession } from '@/lib/session';
import { errorResponse } from '@/lib/http';

// GET /api/picking/store-orders?storeId=xxx - Pedidos de retiro para una tienda
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const em = await getEm();

    // Cargar el usuario que realiza la petición (puede ser null para el login admin)
    const actor = await em.findOne(User, { id: session.userId });

    // IDOR: un no-admin solo puede ver pedidos de SU propia tienda.
    // Admin (rol admin, o el login admin-como-tienda con userId 'admin') puede ver cualquier tienda vía query.
    const isAdmin = session.role === 'admin' || session.userId === 'admin';
    const storeId = isAdmin
      ? req.nextUrl.searchParams.get('storeId')
      : actor?.storeId;

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId es requerido' },
        { status: 400 }
      );
    }

    // Traer pedidos fulfilled (para enviar) y shipped (enviados)
    const [fulfilled, shipped] = await Promise.all([
      getPaidOrders(200, 0, 'enviar'),
      getPaidOrders(200, 0, 'enviados'),
    ]);

    const allOrders = [...fulfilled.orders, ...shipped.orders];

    // Filtrar solo pedidos de retiro en tienda para esta tienda
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeOrders = allOrders.filter((order: any) => {
      const methods = order.shipping_methods;
      if (!methods || methods.length === 0) return false;

      const method = methods[0];
      const methodName = (method.name || '').toLowerCase();

      // Verificar que sea envío a tienda
      const isStorePickup = methodName.includes('retiro') || methodName.includes('tienda') ||
        methodName.includes('pickup') || methodName.includes('sucursal');
      if (!isStorePickup) return false;

      // Debe tener data.store con ID para ser retiro en tienda real
      const store = method.data?.store;
      if (!store || !store.id) return false;

      // Verificar que sea ESTA tienda
      return store.id === storeId;
    });

    // Consultar entregas en MongoDB para estos pedidos
    const orderIds = storeOrders.map((o: any) => o.id);
    const deliveries = await em.find(StoreDelivery, { orderId: { $in: orderIds } });
    const deliveredSet = new Set(deliveries.map((d: any) => d.orderId));

    // Enriquecer pedidos: si MongoDB dice entregado pero Medusa no actualizó, marcarlo
    const enrichedOrders = storeOrders.map((order: any) => {
      if (deliveredSet.has(order.id) && order.fulfillment_status === 'fulfilled') {
        return { ...order, fulfillment_status: 'shipped', _deliveredLocally: true };
      }
      return order;
    });

    return NextResponse.json({
      success: true,
      orders: enrichedOrders,
      total: enrichedOrders.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
