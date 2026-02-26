import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';

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

      audit({
        action: 'item_missing',
        userName: session.userName,
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: 'Todos los faltantes fueron recibidos por escaneo',
        metadata: { resolution: 'resolved', method: 'scan' },
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
