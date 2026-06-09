import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User, PickingSession, PickingItem } from '@/lib/entities';
import { audit } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// Olas obligatorio: el armado individual (per-order) está deshabilitado.
// Las sesiones de preparación se crean por Olas (/api/picking/waves/*). En este
// endpoint solo permitimos DEVOLVER una sesión ya existente (para no dejar
// in_progress viejas sin poder cerrar), pero NO crear sesiones nuevas.
// Para reactivar el armado per-order, poner esto en true.
const PER_ORDER_PICKING_ENABLED: boolean = false;

// GET /api/picking/session/:orderId - Estado del picking
// ?includeCompleted=true para incluir sesiones completadas
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const includeCompleted = req.nextUrl.searchParams.get('includeCompleted') === 'true';

    const query: Record<string, any> = { orderId };
    if (includeCompleted) {
      query.status = { $in: ['in_progress', 'completed'] };
    } else {
      query.status = 'in_progress';
    }

    const session = await em.findOne(PickingSession, query, {
      populate: ['items', 'user'],
      orderBy: { startedAt: 'DESC' },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    const items = session.items.getItems();
    const totalRequired = items.reduce((sum, i) => sum + i.quantityRequired, 0);
    const totalPicked = items.reduce((sum, i) => sum + i.quantityPicked, 0);
    const totalMissing = items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
    const isComplete = items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
    const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        orderId: session.orderId,
        orderDisplayId: session.orderDisplayId,
        status: session.status,
        startedAt: session.startedAt,
        userId: session.user.id,
        userName: session.userName,
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
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/picking/session/:orderId - Iniciar sesión de picking
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const { userId, orderDisplayId, items } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId es requerido' },
        { status: 400 }
      );
    }

    // Validar usuario
    const user = await em.findOne(User, { id: userId });
    if (!user || !user.active) {
      return NextResponse.json(
        { success: false, error: 'Usuario inválido o inactivo' },
        { status: 401 }
      );
    }

    // Verificar sesión existente
    const existing = await em.findOne(PickingSession, {
      orderId,
      status: 'in_progress',
    }, { populate: ['items', 'user'] });

    if (existing) {
      // Retornar la sesión existente
      const existingItems = existing.items.getItems();
      const totalRequired = existingItems.reduce((sum, i) => sum + i.quantityRequired, 0);
      const totalPicked = existingItems.reduce((sum, i) => sum + i.quantityPicked, 0);
      const totalMissing = existingItems.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
      const isComplete = existingItems.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
      const elapsed = Math.round((Date.now() - existing.startedAt.getTime()) / 1000);

      return NextResponse.json({
        success: true,
        session: {
          id: existing.id,
          orderId: existing.orderId,
          orderDisplayId: existing.orderDisplayId,
          status: existing.status,
          startedAt: existing.startedAt,
          userName: existing.userName,
          items: existingItems,
          totalRequired,
          totalPicked,
          totalMissing,
          isComplete,
          progressPercent: totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
          elapsedSeconds: elapsed,
        },
      });
    }

    // Bloqueo duro del armado individual: no se crean sesiones nuevas por acá.
    if (!PER_ORDER_PICKING_ENABLED) {
      return NextResponse.json(
        { success: false, error: 'El armado individual está deshabilitado. Preparalo por Picking por Olas.' },
        { status: 403 }
      );
    }

    // Crear nueva sesión
    const totalRequired = items.reduce((sum: number, i: { quantityRequired: number }) => sum + i.quantityRequired, 0);

    const session = em.create(PickingSession, {
      orderId,
      orderDisplayId: orderDisplayId || 0,
      status: 'in_progress',
      startedAt: new Date(),
      user: em.getReference(User, user.id),
      userName: user.name,
      totalRequired,
      totalPicked: 0,
    });

    for (const item of items as any[]) {
      em.create(PickingItem, {
        session,
        lineItemId: item.lineItemId,
        variantId: item.variantId,
        sku: item.sku,
        barcode: item.barcode,
        quantityRequired: item.quantityRequired,
        quantityPicked: 0,
      });
    }

    await em.persistAndFlush(session);

    audit({
      action: 'session_start',
      userName: user.name,
      userId: user.id,
      orderId,
      orderDisplayId: orderDisplayId || 0,
      details: `Inicio picking pedido #${orderDisplayId || 0} (${totalRequired} items)`,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        orderId: session.orderId,
        orderDisplayId: session.orderDisplayId,
        status: session.status,
        startedAt: session.startedAt,
        userName: session.userName,
        items: session.items.getItems(),
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
    const em = await getEm();
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

    const session = await em.findOne(PickingSession, { orderId, status: 'in_progress' }, { populate: ['user'] });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 }
      );
    }

    session.status = 'cancelled';
    session.cancelReason = reason;
    session.cancelledAt = new Date();
    await em.flush();

    audit({
      action: 'session_cancel',
      userName: session.userName,
      userId: session.user?.id,
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
