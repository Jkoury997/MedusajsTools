import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/unpick - Quitar item (-1)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const { lineItemId } = await req.json();

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

    if (!item || item.quantityPicked <= 0) {
      return NextResponse.json(
        { success: false, error: 'No hay items para quitar' },
        { status: 400 }
      );
    }

    item.quantityPicked -= 1;
    session.totalPicked = items.reduce((sum, i) => sum + i.quantityPicked, 0);

    await em.flush();

    audit({
      action: 'item_unpick',
      userName: session.userName,
      userId: session.user?.id,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Unpick item ${item.sku || item.lineItemId} (${item.quantityPicked}/${item.quantityRequired})`,
      metadata: { lineItemId: item.lineItemId, sku: item.sku, qty: item.quantityPicked },
    });

    const totalRequired = items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = session.totalPicked;
    const isComplete = items.every(i => i.quantityPicked >= i.quantityRequired);
    const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        items,
        totalRequired,
        totalPicked,
        isComplete,
        progressPercent: totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 0,
        elapsedSeconds: elapsed,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al quitar item' },
      { status: 500 }
    );
  }
}
