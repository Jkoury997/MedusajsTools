import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, AuditLog } from '@/lib/mongodb/models';
import { getAllPaidOrders } from '@/lib/medusa';

// GET /api/gestion?tab=por-preparar|preparados|faltantes|por-enviar|enviados
export async function GET(req: NextRequest) {
  try {
    const tab = req.nextUrl.searchParams.get('tab') || 'por-preparar';

    await connectDB();

    // Obtener todos los pedidos pagados de Medusa
    const allOrders = await getAllPaidOrders();

    // Obtener todas las sesiones (completadas + en progreso)
    const allSessions = await PickingSession.find({ status: { $in: ['completed', 'in_progress'] } })
      .select('orderId orderDisplayId status totalRequired totalPicked totalMissing packed packedAt userName completedAt durationSeconds faltanteResolution faltanteResolvedAt faltanteNotes items startedAt')
      .lean();

    const completedSessionMap = new Map<string, any>();
    const inProgressSessionMap = new Map<string, any>();
    for (const s of allSessions) {
      if (s.status === 'completed') {
        completedSessionMap.set(s.orderId, s);
      } else if (s.status === 'in_progress') {
        inProgressSessionMap.set(s.orderId, s);
      }
    }

    // Clasificar pedidos
    const results: any[] = [];

    for (const order of allOrders) {
      const completedSession = completedSessionMap.get(order.id);
      const inProgressSession = inProgressSessionMap.get(order.id);
      const fulfillmentStatus = order.fulfillment_status || 'not_fulfilled';

      // Determinar si el envío es express
      const shippingName = order.shipping_methods?.[0]?.name || '';
      const isExpress = shippingName.toLowerCase().includes('express') ||
        shippingName.toLowerCase().includes('rápido') ||
        shippingName.toLowerCase().includes('rapido');

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
        shippingMethod: shippingName || null,
        isExpress,
        itemCount: (order.items || []).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0),
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
          missingItems: completedSession.items
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

        case 'preparados':
          // Pedidos que están fulfilled (preparados) - incluye con y sin faltantes
          if (fulfillmentStatus === 'fulfilled' && completedSession) {
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
          // Pedidos fulfilled, sin faltantes sin resolver, listos para enviar
          if (fulfillmentStatus === 'fulfilled' && completedSession) {
            const hasUnresolvedFaltantes = completedSession.totalMissing > 0 && ['pending', 'waiting'].includes(completedSession.faltanteResolution);
            if (!hasUnresolvedFaltantes) {
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

    // Ordenar: express primero, luego por fecha (más viejo primero)
    results.sort((a, b) => {
      if (a.isExpress && !b.isExpress) return -1;
      if (!a.isExpress && b.isExpress) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Contar para badges
    const counts: Record<string, number> = { 'por-preparar': 0, preparados: 0, faltantes: 0, 'por-enviar': 0, enviados: 0 };
    for (const order of allOrders) {
      const completedSession = completedSessionMap.get(order.id);
      const fs = order.fulfillment_status || 'not_fulfilled';

      if (['not_fulfilled', 'partially_fulfilled'].includes(fs) && !completedSession) {
        counts['por-preparar']++;
      }
      if (fs === 'fulfilled' && completedSession) {
        counts.preparados++;
        const hasUnresolvedFaltantes = completedSession.totalMissing > 0 && ['pending', 'waiting'].includes(completedSession.faltanteResolution);
        if (hasUnresolvedFaltantes) {
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
