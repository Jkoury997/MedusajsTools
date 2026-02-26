import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, PickingUser, audit } from '@/lib/mongodb/models';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// GET /api/picking/session/:orderId - Estado del picking
// ?includeCompleted=true para incluir sesiones completadas
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;
    const includeCompleted = req.nextUrl.searchParams.get('includeCompleted') === 'true';

    const query: Record<string, any> = { orderId };
    if (includeCompleted) {
      query.status = { $in: ['in_progress', 'completed'] };
    } else {
      query.status = 'in_progress';
    }

    const session = await PickingSession.findOne(query).sort({ startedAt: -1 });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    const totalRequired = session.items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = session.items.reduce((sum, i) => sum + i.quantityPicked, 0);
    const totalMissing = session.items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
    const isComplete = session.items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
    const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    return NextResponse.json({
      success: true,
      session: {
        id: session._id,
        orderId: session.orderId,
        orderDisplayId: session.orderDisplayId,
        status: session.status,
        startedAt: session.startedAt,
        userId: session.userId,
        userName: session.userName,
        items: session.items,
        totalRequired,
        totalPicked,
        totalMissing,
        isComplete,
        progressPercent: totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
        elapsedSeconds: elapsed,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/picking/session/:orderId - Iniciar sesión de picking
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;
    const { userId, orderDisplayId, items } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId es requerido' },
        { status: 400 }
      );
    }

    // Validar usuario
    const user = await PickingUser.findById(userId);
    if (!user || !user.active) {
      return NextResponse.json(
        { success: false, error: 'Usuario inválido o inactivo' },
        { status: 401 }
      );
    }

    // Verificar sesión existente
    const existing = await PickingSession.findOne({
      orderId,
      status: 'in_progress',
    });

    if (existing) {
      // Retornar la sesión existente
      const totalRequired = existing.items.reduce((sum, i) => sum + i.quantityRequired, 0);
      const totalPicked = existing.items.reduce((sum, i) => sum + i.quantityPicked, 0);
      const totalMissing = existing.items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
      const isComplete = existing.items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
      const elapsed = Math.round((Date.now() - existing.startedAt.getTime()) / 1000);

      return NextResponse.json({
        success: true,
        session: {
          id: existing._id,
          orderId: existing.orderId,
          orderDisplayId: existing.orderDisplayId,
          status: existing.status,
          startedAt: existing.startedAt,
          userName: existing.userName,
          items: existing.items,
          totalRequired,
          totalPicked,
          totalMissing,
          isComplete,
          progressPercent: totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
          elapsedSeconds: elapsed,
        },
      });
    }

    // Crear nueva sesión
    const totalRequired = items.reduce((sum: number, i: { quantityRequired: number }) => sum + i.quantityRequired, 0);

    const session = await PickingSession.create({
      orderId,
      orderDisplayId: orderDisplayId || 0,
      status: 'in_progress',
      items: items.map((item: any) => ({
        lineItemId: item.lineItemId,
        variantId: item.variantId,
        sku: item.sku,
        barcode: item.barcode,
        quantityRequired: item.quantityRequired,
        quantityPicked: 0,
      })),
      startedAt: new Date(),
      userId: user._id,
      userName: user.name,
      totalRequired,
      totalPicked: 0,
    });

    audit({
      action: 'session_start',
      userName: user.name,
      userId: user._id.toString(),
      orderId,
      orderDisplayId: orderDisplayId || 0,
      details: `Inicio picking pedido #${orderDisplayId || 0} (${totalRequired} items)`,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session._id,
        orderId: session.orderId,
        orderDisplayId: session.orderDisplayId,
        status: session.status,
        startedAt: session.startedAt,
        userName: session.userName,
        items: session.items,
        totalRequired,
        totalPicked: 0,
        isComplete: false,
        progressPercent: 0,
        elapsedSeconds: 0,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { success: false, error: 'Error al crear sesión' },
      { status: 500 }
    );
  }
}

// DELETE /api/picking/session/:orderId - Cancelar sesión (requiere razón)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;

    // Leer razón del body
    let reason = '';
    try {
      const body = await req.json();
      reason = body.reason?.trim() || '';
    } catch {
      // body vacío
    }

    if (!reason || reason.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Tenés que poner una razón para cancelar (mínimo 3 caracteres)' },
        { status: 400 }
      );
    }

    const session = await PickingSession.findOneAndUpdate(
      { orderId, status: 'in_progress' },
      {
        status: 'cancelled',
        cancelReason: reason,
        cancelledAt: new Date(),
      },
      { new: true }
    );

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    audit({
      action: 'session_cancel',
      userName: session.userName,
      userId: session.userId?.toString(),
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Cancelado: ${reason}`,
    });

    return NextResponse.json({ success: true, message: 'Sesión cancelada' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}
