import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { invalidateOrdersCache } from '@/lib/medusa';
import { fulfillRemainingForOrder } from '@/lib/fulfillment';
import { requireRole } from '@/lib/session';
import { errorResponse } from '@/lib/http';
import { LockMode } from '@mikro-orm/core';

// POST /api/gestion/faltantes - Resolver faltante
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin', 'ecommerce');
    const em = await getEm();
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

    const resolutionLabels: Record<string, string> = {
      voucher: 'Voucher de compensación',
      waiting: 'Esperando mercadería',
      resolved: 'Resuelto',
    };

    // Transacción con lock pesimista sobre la sesión para evitar carreras
    // (doble resolución / doble fulfillment ante llamadas concurrentes o repetidas).
    const result = await em.transactional(async (tem) => {
      const session = await tem.findOne(
        PickingSession,
        { orderId, status: 'completed' },
        { populate: ['items'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!session) {
        return { notFound: true as const };
      }

      session.faltanteResolution = resolution;
      session.faltanteResolvedAt = new Date();
      session.faltanteNotes = notes || '';

      // Si es voucher o resolved, cerrar el cumplimiento COMPLETO: lo pickeado
      // + los faltantes. Los faltantes no se van a recibir (se compensan con el
      // voucher o se resuelven por fuera) pero se registran como cumplidos para
      // que el pedido quede "Cumplido" en Medusa y no parcial para siempre.
      // Se cumple el REMANENTE contra lo ya cumplido (p. ej. el parcial de lo
      // pickeado creado al completar el picking), así que es idempotente.
      let fulfillmentCreated = false;
      let fulfillmentError: string | undefined;
      if (resolution === 'voucher' || resolution === 'resolved') {
        try {
          const targetByLineItem = new Map<string, number>();
          for (const sessionItem of session.items.getItems()) {
            const totalQty = sessionItem.quantityPicked + (sessionItem.quantityMissing || 0);
            if (totalQty > 0) {
              targetByLineItem.set(sessionItem.lineItemId, totalQty);
            }
          }

          if (targetByLineItem.size > 0) {
            await fulfillRemainingForOrder(orderId, targetByLineItem);
            fulfillmentCreated = true;
            session.fulfillmentStatus = 'created';
            invalidateOrdersCache();
          }
        } catch (fulfillError) {
          console.error('[Faltantes] Error creating fulfillment:', fulfillError);
          session.fulfillmentStatus = 'failed';
          fulfillmentError = fulfillError instanceof Error ? fulfillError.message : String(fulfillError);
        }
      }

      audit({
        action: 'item_missing',
        userName: session.userName,
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: `Faltante resuelto: ${resolutionLabels[resolution]}${notes ? ` - ${notes}` : ''}${fulfillmentCreated ? ' - Fulfillment creado' : ''}`,
        metadata: { resolution, notes, totalMissing: session.totalMissing, fulfillmentCreated },
      });

      return { fulfillmentCreated, fulfillmentError };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Faltante marcado como: ${resolutionLabels[resolution]}`,
      fulfillmentCreated: result.fulfillmentCreated,
      ...(result.fulfillmentError ? { fulfillmentError: result.fulfillmentError } : {}),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
