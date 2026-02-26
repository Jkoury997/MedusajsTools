import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';

// GET /api/gestion/faltantes/receive?orderId=xxx - Obtener items faltantes para escaneo
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const orderId = req.nextUrl.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId requerido' }, { status: 400 });
    }

    const session = await PickingSession.findOne({ orderId, status: 'completed' }).lean();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sesión no encontrada' }, { status: 404 });
    }

    const missingItems = session.items
      .filter((i: any) => (i.quantityMissing || 0) > 0)
      .map((i: any) => ({
        lineItemId: i.lineItemId,
        sku: i.sku || '',
        barcode: i.barcode || '',
        quantityMissing: i.quantityMissing,
        quantityReceived: i.quantityReceived || 0,
      }));

    return NextResponse.json({
      success: true,
      orderId,
      orderDisplayId: session.orderDisplayId,
      missingItems,
      faltanteResolution: session.faltanteResolution,
    });
  } catch (error) {
    console.error('[Receive] GET Error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener faltantes' }, { status: 500 });
  }
}

// POST /api/gestion/faltantes/receive - Registrar item recibido por escaneo
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { orderId, barcode, sku, lineItemId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId requerido' }, { status: 400 });
    }

    if (!barcode && !sku && !lineItemId) {
      return NextResponse.json({ success: false, error: 'barcode, sku o lineItemId requerido' }, { status: 400 });
    }

    const session = await PickingSession.findOne({ orderId, status: 'completed' });
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sesión no encontrada' }, { status: 404 });
    }

    // Buscar el item faltante que coincida
    let matchedItem = null;
    for (const item of session.items) {
      if ((item.quantityMissing || 0) <= 0) continue;

      const received = (item as any).quantityReceived || 0;
      if (received >= (item.quantityMissing || 0)) continue; // Ya recibido todo

      if (lineItemId && item.lineItemId === lineItemId) {
        matchedItem = item;
        break;
      }
      if (barcode && item.barcode === barcode) {
        matchedItem = item;
        break;
      }
      if (sku && item.sku === sku) {
        matchedItem = item;
        break;
      }
    }

    if (!matchedItem) {
      return NextResponse.json({
        success: false,
        error: 'No se encontró un item faltante que coincida o ya fue recibido',
      }, { status: 404 });
    }

    // Incrementar quantityReceived
    const currentReceived = (matchedItem as any).quantityReceived || 0;
    (matchedItem as any).quantityReceived = currentReceived + 1;
    await session.save();

    // Verificar si todos los faltantes fueron recibidos
    const allReceived = session.items
      .filter(i => (i.quantityMissing || 0) > 0)
      .every(i => ((i as any).quantityReceived || 0) >= (i.quantityMissing || 0));

    if (allReceived) {
      session.faltanteResolution = 'resolved';
      session.faltanteResolvedAt = new Date();
      session.faltanteNotes = (session.faltanteNotes || '') + ' | Mercadería recibida completa';
      await session.save();

      // Crear UN SOLO fulfillment en Medusa con TODOS los items (pickeados + faltantes recibidos)
      let fulfillmentCreated = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orderData = await medusaRequest<{ order: any }>(
          `/admin/orders/${orderId}?fields=+items.*,+fulfillments.*`
        );
        const order = orderData.order;

        // Construir fulfillment con cantidad total por item (picked + missing)
        const fulfillmentItems: { id: string; quantity: number }[] = [];
        for (const sessionItem of session.items) {
          const totalQty = sessionItem.quantityPicked + (sessionItem.quantityMissing || 0);
          if (totalQty <= 0) continue;

          const medusaItem = order.items?.find((i: any) => i.id === sessionItem.lineItemId);
          if (medusaItem) {
            fulfillmentItems.push({
              id: medusaItem.id,
              quantity: totalQty,
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
        console.error('[Receive] Error creating fulfillment for received faltantes:', fulfillError);
      }

      audit({
        action: 'item_missing',
        userName: session.userName,
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: `Todos los faltantes fueron recibidos por escaneo${fulfillmentCreated ? ' - Fulfillment creado en Medusa' : ''}`,
        metadata: { resolution: 'resolved', method: 'scan', fulfillmentCreated },
      });
    }

    // Estado actual de items
    const missingItems = session.items
      .filter((i: any) => (i.quantityMissing || 0) > 0)
      .map((i: any) => ({
        lineItemId: i.lineItemId,
        sku: i.sku || '',
        barcode: i.barcode || '',
        quantityMissing: i.quantityMissing,
        quantityReceived: (i as any).quantityReceived || 0,
      }));

    return NextResponse.json({
      success: true,
      matched: {
        lineItemId: matchedItem.lineItemId,
        sku: matchedItem.sku,
        barcode: matchedItem.barcode,
        quantityReceived: (matchedItem as any).quantityReceived,
        quantityMissing: matchedItem.quantityMissing,
      },
      allReceived,
      missingItems,
    });
  } catch (error) {
    console.error('[Receive] POST Error:', error);
    return NextResponse.json({ success: false, error: 'Error al registrar recepción' }, { status: 500 });
  }
}
