import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession } from '@/lib/mongodb/models';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/unpick - Quitar item (-1)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;
    const { lineItemId } = await req.json();

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

    const item = session.items.find(i => i.lineItemId === lineItemId);

    if (!item || item.quantityPicked <= 0) {
      return NextResponse.json(
        { success: false, error: 'No hay items para quitar' },
        { status: 400 }
      );
    }

    item.quantityPicked -= 1;
    session.totalPicked = session.items.reduce((sum, i) => sum + i.quantityPicked, 0);

    await session.save();

    const totalRequired = session.items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = session.totalPicked;
    const isComplete = session.items.every(i => i.quantityPicked >= i.quantityRequired);
    const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    return NextResponse.json({
      success: true,
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
    return NextResponse.json(
      { success: false, error: 'Error al quitar item' },
      { status: 500 }
    );
  }
}
