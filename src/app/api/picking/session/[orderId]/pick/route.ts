import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/pick - Pickear item (+1)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;
    const { lineItemId, barcode, method } = await req.json();

    const session = await PickingSession.findOne({
      orderId,
      status: 'in_progress',
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    // Buscar el item
    let item;
    if (method === 'barcode' && barcode) {
      item = session.items.find(i => i.barcode === barcode);
    } else if (lineItemId) {
      item = session.items.find(i => i.lineItemId === lineItemId);
    }

    if (!item) {
      if (method === 'barcode') {
        // Build a helpful error message showing which barcodes exist
        const availableBarcodes = session.items
          .filter(i => i.barcode && i.quantityPicked < i.quantityRequired)
          .map(i => i.barcode);
        const errorMsg = availableBarcodes.length > 0
          ? `Código "${barcode}" no encontrado. Códigos válidos: ${availableBarcodes.join(', ')}`
          : 'Código de barras no encontrado en este pedido';
        return NextResponse.json(
          { success: false, error: errorMsg },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Item no encontrado' },
        { status: 400 }
      );
    }

    // Verificar que no exceda
    if (item.quantityPicked >= item.quantityRequired) {
      return NextResponse.json(
        { success: false, error: `Ya se pickearon todos (${item.quantityPicked}/${item.quantityRequired})` },
        { status: 400 }
      );
    }

    // Incrementar
    item.quantityPicked += 1;
    item.pickedAt = new Date();
    item.scanMethod = method || 'manual';

    session.totalPicked = session.items.reduce((sum, i) => sum + i.quantityPicked, 0);

    await session.save();

    const totalRequired = session.items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = session.totalPicked;
    const isComplete = session.items.every(i => i.quantityPicked >= i.quantityRequired);
    const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    audit({
      action: 'item_pick',
      userName: session.userName,
      userId: session.userId?.toString(),
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Pick item ${item.barcode || item.sku || item.lineItemId} (${item.quantityPicked}/${item.quantityRequired}) via ${method || 'manual'}`,
      metadata: { lineItemId: item.lineItemId, sku: item.sku, barcode: item.barcode, method: method || 'manual', qty: item.quantityPicked },
    });

    return NextResponse.json({
      success: true,
      pickedItem: {
        lineItemId: item.lineItemId,
        quantityPicked: item.quantityPicked,
        quantityRequired: item.quantityRequired,
      },
      session: {
        id: session._id,
        items: session.items,
        totalRequired,
        totalPicked,
        isComplete,
        progressPercent: totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 0,
        elapsedSeconds: elapsed,
      },
    });
  } catch (error) {
    console.error('Error picking item:', error);
    return NextResponse.json(
      { success: false, error: 'Error al pickear' },
      { status: 500 }
    );
  }
}
