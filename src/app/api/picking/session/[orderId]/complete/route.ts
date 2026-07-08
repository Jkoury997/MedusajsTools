import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession, User } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { invalidateOrdersCache } from '@/lib/medusa';
import { fulfillRemainingForOrder } from '@/lib/fulfillment';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/complete - Completar picking + fulfillment en Medusa
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId es requerido' },
        { status: 400 }
      );
    }

    // Validar usuario
    const user = await em.findOne(User, { id: userId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no válido' },
        { status: 401 }
      );
    }

    // Obtener sesión
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

    // Verificar que todo esté pickeado o marcado como faltante
    const allAccounted = items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
    if (!allAccounted) {
      const totalRequired = items.reduce((sum, i) => sum + i.quantityRequired, 0);
      const totalPicked = items.reduce((sum, i) => sum + i.quantityPicked, 0);
      const totalMissing = items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
      return NextResponse.json(
        { success: false, error: `Faltan items (${totalPicked} pickeados + ${totalMissing} faltantes de ${totalRequired})` },
        { status: 400 }
      );
    }

    // Calcular duración
    const durationSeconds = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

    const hasMissing = items.some(i => (i.quantityMissing || 0) > 0);

    const totalMissing = items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
    const missingItems = items
      .filter(i => (i.quantityMissing || 0) > 0)
      .map(i => ({ lineItemId: i.lineItemId, sku: i.sku, barcode: i.barcode, quantityMissing: i.quantityMissing }));

    // PASO 1: Crear fulfillment en Medusa (ANTES de marcar la sesión como completada)
    // Se crea SIEMPRE con lo pickeado, haya o no faltantes: con faltantes queda
    // un cumplimiento PARCIAL (lo que está, listo para enviar/gestionar) y el
    // resto se cumple al resolver los faltantes (recepción de mercadería).
    let fulfillmentCreated = false;
    let fulfillmentError = '';
    // Indica si se intentó crear un fulfillment (hay items a despachar) y éste falló
    let fulfillmentFailed = false;

    // Idempotencia: si ya se creó el fulfillment previamente, no volver a crearlo
    const alreadyFulfilled = session.fulfillmentStatus === 'created';
    const totalPickedQty = items.reduce((sum, i) => sum + i.quantityPicked, 0);

    if (alreadyFulfilled) {
      fulfillmentCreated = true;
    } else if (totalPickedQty > 0) {
      try {
        // Fulfillment solo con las cantidades realmente pickeadas, descontando
        // lo ya cumplido en Medusa (reintentos idempotentes). Nunca despachar
        // la cantidad pedida para una línea sin item de sesión. El reintento
        // ante "No stock reservation found" (ML/ERP) vive en el helper.
        const targetByLineItem = new Map<string, number>();
        for (const si of items) {
          if (si.quantityPicked > 0) targetByLineItem.set(si.lineItemId, si.quantityPicked);
        }
        await fulfillRemainingForOrder(orderId, targetByLineItem);

        fulfillmentCreated = true;
        invalidateOrdersCache();

        audit({
          action: 'fulfillment_create',
          userName: user.name,
          userId: user.id,
          orderId,
          orderDisplayId: session.orderDisplayId,
          details: hasMissing
            ? `Fulfillment parcial creado en Medusa para pedido #${session.orderDisplayId} (${totalPickedQty} pickeados, ${totalMissing} faltantes pendientes)`
            : `Fulfillment creado en Medusa para pedido #${session.orderDisplayId}`,
        });
      } catch (error) {
        // El fulfillment falló: NO completamos la sesión, marcamos el estado como 'failed'
        fulfillmentError = error instanceof Error ? error.message : 'Error al crear fulfillment';
        fulfillmentFailed = true;
        console.error('Error creating fulfillment in Medusa:', error);

        audit({
          action: 'fulfillment_error',
          userName: user.name,
          userId: user.id,
          orderId,
          orderDisplayId: session.orderDisplayId,
          details: `Error fulfillment: ${fulfillmentError}`,
        });
      }
    } else {
      console.log(`[complete] Nada pickeado (${totalMissing} faltantes), no hay fulfillment para crear`);
    }

    // Si se intentó crear el fulfillment y falló: NO marcar la sesión como completada.
    if (fulfillmentFailed) {
      session.fulfillmentStatus = 'failed';
      await em.flush();

      return NextResponse.json(
        {
          success: false,
          message: 'Error al crear el fulfillment en Medusa; la sesión NO se marcó como completada',
          sessionId: session.id,
          orderId,
          fulfillmentCreated: false,
          fulfillmentError: fulfillmentError || undefined,
          totalMissing,
          missingItems,
        },
        { status: 502 }
      );
    }

    // PASO 2: Completar la sesión en MongoDB (solo si el fulfillment fue exitoso o no aplicaba)
    session.status = 'completed';
    session.completedAt = new Date();
    session.durationSeconds = durationSeconds;
    session.completedByName = user.name;

    // fulfillmentStatus refleja el resultado real:
    // - 'created' si se creó (o ya existía) un fulfillment
    // - 'none' si no había nada que despachar (todo faltante)
    session.fulfillmentStatus = fulfillmentCreated ? 'created' : 'none';

    // Si hay faltantes, marcar resolución como pendiente
    if (hasMissing) {
      session.faltanteResolution = 'pending';
    }

    await em.flush();

    audit({
      action: 'session_complete',
      userName: user.name,
      userId: user.id,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Picking completado en ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s (${session.totalPicked} items${totalMissing > 0 ? `, ${totalMissing} faltantes` : ''})`,
      metadata: { durationSeconds, totalPicked: session.totalPicked, totalRequired: session.totalRequired, totalMissing, missingItems },
    });

    // Formatear duración
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    return NextResponse.json({
      success: true,
      message: fulfillmentCreated
        ? (hasMissing
          ? 'Picking completado: lo pickeado quedó preparado (cumplimiento parcial), faltantes pendientes'
          : 'Picking completado y pedido marcado como preparado')
        : 'Picking completado (sin items para despachar)',
      sessionId: session.id,
      orderId,
      durationSeconds,
      durationFormatted,
      userName: user.name,
      fulfillmentCreated,
      fulfillmentError: fulfillmentError || undefined,
      totalMissing,
      missingItems,
    });
  } catch (error) {
    console.error('Error completing picking:', error);
    return NextResponse.json(
      { success: false, error: 'Error al completar picking' },
      { status: 500 }
    );
  }
}
