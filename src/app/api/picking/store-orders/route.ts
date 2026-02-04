import { NextRequest, NextResponse } from 'next/server';
import { getPaidOrders } from '@/lib/medusa';

// GET /api/picking/store-orders?storeId=xxx - Pedidos de retiro para una tienda
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId');

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

    return NextResponse.json({
      success: true,
      orders: storeOrders,
      total: storeOrders.length,
    });
  } catch (error) {
    console.error('[store-orders] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener pedidos' },
      { status: 500 }
    );
  }
}
