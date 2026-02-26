import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, AuditLog } from '@/lib/mongodb/models';
import { getAllPaidOrders } from '@/lib/medusa';

// GET /api/gestion?tab=preparados|faltantes|por-enviar|enviados
export async function GET(req: NextRequest) {
  try {
    const tab = req.nextUrl.searchParams.get('tab') || 'preparados';

    await connectDB();

    // Obtener todos los pedidos pagados de Medusa
    const allOrders = await getAllPaidOrders();

    // Obtener todas las sesiones completadas
    const completedSessions = await PickingSession.find({ status: 'completed' })
      .select('orderId orderDisplayId totalRequired totalPicked totalMissing packed packedAt userName completedAt durationSeconds faltanteResolution faltanteResolvedAt faltanteNotes items')
      .lean();

    const sessionMap = new Map<string, any>();
    for (const s of completedSessions) {
      sessionMap.set(s.orderId, s);
    }

    // Clasificar pedidos
    const results: any[] = [];

    for (const order of allOrders) {
      const session = sessionMap.get(order.id);
      const fulfillmentStatus = order.fulfillment_status || 'not_fulfilled';

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
            : order.email || 'Sin nombre',
        address: order.shipping_address
          ? `${order.shipping_address.address_1}, ${order.shipping_address.city}`
          : null,
        province: order.shipping_address?.province || null,
        fulfillmentStatus,
        shippingMethod: order.shipping_methods?.[0]?.name || null,
        itemCount: (order.items || []).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0),
        session: session ? {
          totalRequired: session.totalRequired,
          totalPicked: session.totalPicked,
          totalMissing: session.totalMissing,
          packed: session.packed,
          packedAt: session.packedAt,
          userName: session.userName,
          completedAt: session.completedAt,
          durationSeconds: session.durationSeconds,
          faltanteResolution: session.faltanteResolution,
          faltanteResolvedAt: session.faltanteResolvedAt,
          faltanteNotes: session.faltanteNotes,
          missingItems: session.items
            ?.filter((i: any) => (i.quantityMissing || 0) > 0)
            .map((i: any) => ({
              lineItemId: i.lineItemId,
              sku: i.sku,
              barcode: i.barcode,
              quantityRequired: i.quantityRequired,
              quantityPicked: i.quantityPicked,
              quantityMissing: i.quantityMissing,
            })) || [],
        } : null,
      };

      switch (tab) {
        case 'preparados':
          // Pedidos que están fulfilled (preparados) - incluye con y sin faltantes
          if (fulfillmentStatus === 'fulfilled' && session) {
            results.push(orderData);
          }
          break;

        case 'faltantes':
          // Pedidos con faltantes pendientes de resolución
          if (session && session.totalMissing > 0 && session.faltanteResolution === 'pending') {
            results.push(orderData);
          }
          break;

        case 'por-enviar':
          // Pedidos fulfilled, sin faltantes pendientes, listos para enviar
          if (fulfillmentStatus === 'fulfilled' && session) {
            const hasPendingFaltantes = session.totalMissing > 0 && session.faltanteResolution === 'pending';
            if (!hasPendingFaltantes) {
              results.push(orderData);
            }
          }
          break;

        case 'enviados':
          // Pedidos enviados o entregados
          if (['shipped', 'partially_shipped', 'delivered'].includes(fulfillmentStatus)) {
            // Agregar logs de auditoría para este pedido
            const logs = await AuditLog.find({ orderId: order.id })
              .sort({ createdAt: -1 })
              .limit(20)
              .lean();
            orderData.logs = logs;
            results.push(orderData);
          }
          break;
      }
    }

    // Ordenar por fecha de creación (más viejo primero)
    results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Contar para badges
    const counts = { preparados: 0, faltantes: 0, 'por-enviar': 0, enviados: 0 };
    for (const order of allOrders) {
      const session = sessionMap.get(order.id);
      const fs = order.fulfillment_status || 'not_fulfilled';

      if (fs === 'fulfilled' && session) {
        counts.preparados++;
        if (session.totalMissing > 0 && session.faltanteResolution === 'pending') {
          counts.faltantes++;
        } else {
          counts['por-enviar']++;
        }
      }
      if (['shipped', 'partially_shipped', 'delivered'].includes(fs)) {
        counts.enviados++;
      }
    }

    return NextResponse.json({ success: true, orders: results, counts });
  } catch (error) {
    console.error('[Gestion API] Error:', error);
    return NextResponse.json({ success: false, error: 'Error al cargar datos' }, { status: 500 });
  }
}
