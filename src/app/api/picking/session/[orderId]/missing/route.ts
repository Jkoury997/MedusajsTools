import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/missing - Marcar item como faltante
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const { lineItemId, quantity } = await req.json();

    if (!lineItemId || quantity === undefined || quantity < 0) {
      return NextResponse.json(
        { success: false, error: 'lineItemId y quantity son requeridos' },
        { status: 400 }
      );
    }

    const session = await em.findOne(PickingSession, {
      orderId,
      status: 'in_progress',
    }, { populate: ['items', 'user'] });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    const items = session.items.getItems();
    const item = items.find(i => i.lineItemId === lineItemId);
    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Item no encontrado' },
        { status: 400 }
      );
    }

    // La cantidad faltante no puede superar lo que queda por pickear
    const remaining = item.quantityRequired - item.quantityPicked;
    const missingQty = Math.min(quantity, remaining);

    item.quantityMissing = missingQty;

    // Recalcular totales
    session.totalMissing = items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);

    await em.flush();

    const totalRequired = items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = session.totalPicked;
    const totalMissing = session.totalMissing;
    const isComplete = items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
    const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    audit({
      action: 'item_missing',
      userName: session.userName,
      userId: session.user.id,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Item ${item.sku || item.barcode || item.lineItemId} marcado como faltante (${missingQty} unidades)`,
      metadata: { lineItemId: item.lineItemId, sku: item.sku, barcode: item.barcode, quantityMissing: missingQty },
    });

    return NextResponse.json({
      success: true,
      missingItem: {
        lineItemId: item.lineItemId,
        quantityPicked: item.quantityPicked,
        quantityMissing: item.quantityMissing,
        quantityRequired: item.quantityRequired,
      },
      session: {
        id: session.id,
        items,
        totalRequired,
        totalPicked,
        totalMissing,
        isComplete,
        progressPercent: totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
        elapsedSeconds: elapsed,
      },
    });
  } catch (error) {
    console.error('Error marking item as missing:', error);
    return NextResponse.json(
      { success: false, error: 'Error al marcar faltante' },
      { status: 500 }
    );
  }
}
