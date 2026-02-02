import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, PickingUser, audit } from '@/lib/mongodb/models';
import { medusaRequest } from '@/lib/medusa';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/complete - Completar picking + fulfillment en Medusa
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { orderId } = await params;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId es requerido' },
        { status: 400 }
      );
    }

    // Validar usuario
    const user = await PickingUser.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no válido' },
        { status: 401 }
      );
    }

    // Obtener sesión
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

    // Verificar que todo esté pickeado
    const allPicked = session.items.every(i => i.quantityPicked >= i.quantityRequired);
    if (!allPicked) {
      const totalRequired = session.items.reduce((sum, i) => sum + i.quantityRequired, 0);
      const totalPicked = session.items.reduce((sum, i) => sum + i.quantityPicked, 0);
      return NextResponse.json(
        { success: false, error: `Faltan items (${totalPicked}/${totalRequired})` },
        { status: 400 }
      );
    }

    // Calcular duración
    const durationSeconds = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    // PASO 1: Completar sesión en MongoDB
    session.status = 'completed';
    session.completedAt = new Date();
    session.durationSeconds = durationSeconds;
    session.completedByName = user.name;
    await session.save();

    audit({
      action: 'session_complete',
      userName: user.name,
      userId: user._id.toString(),
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Picking completado en ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s (${session.totalPicked} items)`,
      metadata: { durationSeconds, totalPicked: session.totalPicked, totalRequired: session.totalRequired },
    });

    // PASO 2: Crear fulfillment en Medusa
    let fulfillmentCreated = false;
    let fulfillmentError = '';

    try {
      // Obtener el pedido de Medusa para tener los datos de items
      const orderData = await medusaRequest<{ order: any }>(
        `/admin/orders/${orderId}?fields=+items.*,+shipping_methods.*`
      );

      const order = orderData.order;

      // Crear fulfillment en Medusa
      // MedusaJS v2 endpoint: POST /admin/orders/:id/fulfillments (plural)
      await medusaRequest(`/admin/orders/${orderId}/fulfillments`, {
        method: 'POST',
        body: {
          items: order.items.map((item: any) => ({
            id: item.id,
            quantity: item.quantity,
          })),
        },
      });

      fulfillmentCreated = true;

      audit({
        action: 'fulfillment_create',
        userName: user.name,
        userId: user._id.toString(),
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: `Fulfillment creado en Medusa para pedido #${session.orderDisplayId}`,
      });
    } catch (error) {
      // Si falla el fulfillment, igual el picking queda completado
      fulfillmentError = error instanceof Error ? error.message : 'Error al crear fulfillment';
      console.error('Error creating fulfillment in Medusa:', error);

      audit({
        action: 'fulfillment_error',
        userName: user.name,
        userId: user._id.toString(),
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: `Error fulfillment: ${fulfillmentError}`,
      });
    }

    // Formatear duración
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    return NextResponse.json({
      success: true,
      message: fulfillmentCreated
        ? 'Picking completado y pedido marcado como preparado'
        : 'Picking completado pero hubo un error al actualizar Medusa',
      sessionId: session._id,
      orderId,
      durationSeconds,
      durationFormatted,
      userName: user.name,
      fulfillmentCreated,
      fulfillmentError: fulfillmentError || undefined,
    });
  } catch (error) {
    console.error('Error completing picking:', error);
    return NextResponse.json(
      { success: false, error: 'Error al completar picking' },
      { status: 500 }
    );
  }
}
