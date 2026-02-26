import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';

// POST /api/gestion/faltantes - Resolver faltante
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { orderId, resolution, notes } = await req.json();

    if (!orderId || !resolution) {
      return NextResponse.json(
        { success: false, error: 'orderId y resolution son requeridos' },
        { status: 400 }
      );
    }

    if (!['voucher', 'waiting', 'resolved'].includes(resolution)) {
      return NextResponse.json(
        { success: false, error: 'resolution debe ser: voucher, waiting o resolved' },
        { status: 400 }
      );
    }

    const session = await PickingSession.findOne({ orderId, status: 'completed' });
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    session.faltanteResolution = resolution;
    session.faltanteResolvedAt = new Date();
    session.faltanteNotes = notes || '';
    await session.save();

    // Si es voucher o resolved, crear fulfillment solo con lo que se pickeó
    // (los faltantes no se van a recibir)
    let fulfillmentCreated = false;
    if (resolution === 'voucher' || resolution === 'resolved') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orderData = await medusaRequest<{ order: any }>(
          `/admin/orders/${orderId}?fields=+items.*`
        );
        const order = orderData.order;

        const fulfillmentItems: { id: string; quantity: number }[] = [];
        for (const sessionItem of session.items) {
          if (sessionItem.quantityPicked <= 0) continue;
          const medusaItem = order.items?.find((i: any) => i.id === sessionItem.lineItemId);
          if (medusaItem) {
            fulfillmentItems.push({
              id: medusaItem.id,
              quantity: sessionItem.quantityPicked,
            });
          }
        }

        if (fulfillmentItems.length > 0) {
          await medusaRequest(`/admin/orders/${orderId}/fulfillments`, {
            method: 'POST',
            body: { items: fulfillmentItems },
          });
          fulfillmentCreated = true;
          invalidateOrdersCache();
        }
      } catch (fulfillError) {
        console.error('[Faltantes] Error creating fulfillment:', fulfillError);
      }
    }

    const resolutionLabels: Record<string, string> = {
      voucher: 'Voucher de compensación',
      waiting: 'Esperando mercadería',
      resolved: 'Resuelto',
    };

    audit({
      action: 'item_missing',
      userName: session.userName,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Faltante resuelto: ${resolutionLabels[resolution]}${notes ? ` - ${notes}` : ''}${fulfillmentCreated ? ' - Fulfillment creado' : ''}`,
      metadata: { resolution, notes, totalMissing: session.totalMissing, fulfillmentCreated },
    });

    return NextResponse.json({
      success: true,
      message: `Faltante marcado como: ${resolutionLabels[resolution]}`,
    });
  } catch (error) {
    console.error('[Faltantes API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al resolver faltante' },
      { status: 500 }
    );
  }
}
