import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';

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
      details: `Faltante resuelto: ${resolutionLabels[resolution]}${notes ? ` - ${notes}` : ''}`,
      metadata: { resolution, notes, totalMissing: session.totalMissing },
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
