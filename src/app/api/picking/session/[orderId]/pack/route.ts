import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, PickingUser } from '@/lib/mongodb/models';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/pack - Marcar pedido como empaquetado/listo para enviar
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;
    const { userId } = await req.json();

    // Buscar sesión completada
    const session = await PickingSession.findOne({
      orderId,
      status: 'completed',
    }).sort({ completedAt: -1 });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión completada para este pedido' },
        { status: 404 }
      );
    }

    if (session.packed) {
      return NextResponse.json(
        { success: false, error: 'Este pedido ya fue marcado como empaquetado' },
        { status: 400 }
      );
    }

    // Obtener nombre del usuario que empaqueta
    let packedByName = session.userName;
    if (userId) {
      const user = await PickingUser.findById(userId);
      if (user) packedByName = user.name;
    }

    session.packed = true;
    session.packedAt = new Date();
    session.packedByName = packedByName;
    await session.save();

    return NextResponse.json({
      success: true,
      packedAt: session.packedAt,
      packedByName,
    });
  } catch (error) {
    console.error('Error marking as packed:', error);
    return NextResponse.json(
      { success: false, error: 'Error al marcar como empaquetado' },
      { status: 500 }
    );
  }
}
