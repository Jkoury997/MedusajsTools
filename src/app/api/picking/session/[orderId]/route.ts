import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, PickingUser } from '@/lib/mongodb/models';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// GET /api/picking/session/:orderId - Estado del picking
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;

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

    const totalRequired = session.items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = session.items.reduce((sum, i) => sum + i.quantityPicked, 0);
    const isComplete = session.items.every(i => i.quantityPicked >= i.quantityRequired);
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
        isComplete,
        progressPercent: totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 0,
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
      const isComplete = existing.items.every(i => i.quantityPicked >= i.quantityRequired);
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
          isComplete,
          progressPercent: totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 0,
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

// DELETE /api/picking/session/:orderId - Cancelar sesión
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;

    const session = await PickingSession.findOneAndUpdate(
      { orderId, status: 'in_progress' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Sesión cancelada' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}
