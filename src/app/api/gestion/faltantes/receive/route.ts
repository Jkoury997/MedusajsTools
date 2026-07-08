import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { invalidateOrdersCache } from '@/lib/medusa';
import { fulfillRemainingForOrder } from '@/lib/fulfillment';
import { requireRole } from '@/lib/session';
import { errorResponse } from '@/lib/http';
import { LockMode } from '@mikro-orm/core';

// GET /api/gestion/faltantes/receive?orderId=xxx - Obtener items faltantes para escaneo
export async function GET(req: NextRequest) {
  try {
    const em = await getEm();
    const orderId = req.nextUrl.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId requerido' }, { status: 400 });
    }

    const session = await em.findOne(PickingSession, { orderId, status: 'completed' }, { populate: ['items'] });
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sesión no encontrada' }, { status: 404 });
    }

    const missingItems = session.items.getItems()
      .filter((i) => (i.quantityMissing || 0) > 0)
      .map((i) => ({
        lineItemId: i.lineItemId,
        sku: i.sku || '',
        barcode: i.barcode || '',
        quantityMissing: i.quantityMissing,
        quantityReceived: i.quantityReceived || 0,
      }));

    return NextResponse.json({
      success: true,
      orderId,
      orderDisplayId: session.orderDisplayId,
      missingItems,
      faltanteResolution: session.faltanteResolution,
    });
  } catch (error) {
    console.error('[Receive] GET Error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener faltantes' }, { status: 500 });
  }
}

// POST /api/gestion/faltantes/receive - Registrar item recibido por escaneo
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin', 'ecommerce');
    const em = await getEm();
    const { orderId, barcode, sku, lineItemId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId requerido' }, { status: 400 });
    }

    if (!barcode && !sku && !lineItemId) {
      return NextResponse.json({ success: false, error: 'barcode, sku o lineItemId requerido' }, { status: 400 });
    }

    // Transacción con lock pesimista sobre la sesión: el read-modify-write de
    // quantityReceived y la creación del fulfillment deben ser atómicos para
    // evitar dobles recepciones / dobles fulfillments ante escaneos concurrentes.
    const result = await em.transactional(async (tem) => {
      const session = await tem.findOne(
        PickingSession,
        { orderId, status: 'completed' },
        { populate: ['items'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!session) {
        return { notFound: true as const };
      }

      // Crea en Medusa el fulfillment del REMANENTE hasta pickeado + faltante:
      // - Pedidos nuevos: el parcial de lo pickeado ya se creó al completar el
      //   picking, así que acá se cumple solo lo recibido.
      // - Pedidos viejos (sin parcial): el remanente es todo (pickeado + recibido).
      // Idempotente: si no queda nada por cumplir, no crea nada y cuenta como creado.
      const fulfillReceived = async (): Promise<{ created: boolean; error?: string }> => {
        try {
          const targetByLineItem = new Map<string, number>();
          for (const sessionItem of session.items.getItems()) {
            const totalQty = sessionItem.quantityPicked + (sessionItem.quantityMissing || 0);
            if (totalQty > 0) targetByLineItem.set(sessionItem.lineItemId, totalQty);
          }
          await fulfillRemainingForOrder(orderId, targetByLineItem);
          session.fulfillmentStatus = 'created';
          invalidateOrdersCache();
          return { created: true };
        } catch (fulfillError) {
          console.error('[Receive] Error creating fulfillment for received faltantes:', fulfillError);
          session.fulfillmentStatus = 'failed';
          return {
            created: false,
            error: fulfillError instanceof Error ? fulfillError.message : String(fulfillError),
          };
        }
      };

      // Buscar el item faltante que coincida
      let matchedItem = null;
      for (const item of session.items.getItems()) {
        if ((item.quantityMissing || 0) <= 0) continue;

        const received = item.quantityReceived || 0;
        if (received >= (item.quantityMissing || 0)) continue; // Ya recibido todo

        if (lineItemId && item.lineItemId === lineItemId) {
          matchedItem = item;
          break;
        }
        if (barcode && item.barcode === barcode) {
          matchedItem = item;
          break;
        }
        if (sku && item.sku === sku) {
          matchedItem = item;
          break;
        }
      }

      // Estado actual de items (para las respuestas)
      const listMissingItems = () => session.items.getItems()
        .filter((i) => (i.quantityMissing || 0) > 0)
        .map((i) => ({
          lineItemId: i.lineItemId,
          sku: i.sku || '',
          barcode: i.barcode || '',
          quantityMissing: i.quantityMissing,
          quantityReceived: i.quantityReceived || 0,
        }));

      if (!matchedItem) {
        // Sin item pendiente que coincida: puede ser un reintento con todo ya
        // recibido pero el fulfillment pendiente/fallido (p. ej. Medusa caído
        // en el escaneo anterior). Re-escanear cualquier item lo reintenta.
        const missing = session.items.getItems().filter((i) => (i.quantityMissing || 0) > 0);
        const allAlreadyReceived = missing.length > 0
          && missing.every((i) => (i.quantityReceived || 0) >= (i.quantityMissing || 0));
        if (allAlreadyReceived && session.fulfillmentStatus !== 'created') {
          const retry = await fulfillReceived();
          if (retry.created) {
            audit({
              action: 'item_missing',
              userName: session.userName,
              orderId,
              orderDisplayId: session.orderDisplayId,
              details: 'Reintento de fulfillment de faltantes recibidos - Fulfillment creado en Medusa',
              metadata: { resolution: 'resolved', method: 'scan_retry', fulfillmentCreated: true },
            });
            return {
              matched: null,
              allReceived: true,
              missingItems: listMissingItems(),
              fulfillmentCreated: true,
              fulfillmentError: undefined,
            };
          }
        }
        return { noMatch: true as const };
      }

      // Incrementar quantityReceived
      matchedItem.quantityReceived = (matchedItem.quantityReceived || 0) + 1;

      // Verificar si todos los faltantes fueron recibidos
      const allReceived = session.items.getItems()
        .filter((i) => (i.quantityMissing || 0) > 0)
        .every((i) => (i.quantityReceived || 0) >= (i.quantityMissing || 0));

      let fulfillmentCreated = false;
      let fulfillmentError: string | undefined;

      if (allReceived) {
        session.faltanteResolution = 'resolved';
        session.faltanteResolvedAt = new Date();
        session.faltanteNotes = (session.faltanteNotes || '') + ' | Mercadería recibida completa';

        const fulfillment = await fulfillReceived();
        fulfillmentCreated = fulfillment.created;
        fulfillmentError = fulfillment.error;

        audit({
          action: 'item_missing',
          userName: session.userName,
          orderId,
          orderDisplayId: session.orderDisplayId,
          details: `Todos los faltantes fueron recibidos por escaneo${fulfillmentCreated ? ' - Fulfillment creado en Medusa' : ''}`,
          metadata: { resolution: 'resolved', method: 'scan', fulfillmentCreated },
        });
      }

      const missingItems = listMissingItems();

      return {
        matched: {
          lineItemId: matchedItem.lineItemId,
          sku: matchedItem.sku,
          barcode: matchedItem.barcode,
          quantityReceived: matchedItem.quantityReceived,
          quantityMissing: matchedItem.quantityMissing,
        },
        allReceived,
        missingItems,
        fulfillmentCreated,
        fulfillmentError,
      };
    });

    if ('notFound' in result) {
      return NextResponse.json({ success: false, error: 'Sesión no encontrada' }, { status: 404 });
    }

    if ('noMatch' in result) {
      return NextResponse.json({
        success: false,
        error: 'No se encontró un item faltante que coincida o ya fue recibido',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      matched: result.matched,
      allReceived: result.allReceived,
      missingItems: result.missingItems,
      fulfillmentCreated: result.fulfillmentCreated,
      ...(result.fulfillmentError ? { fulfillmentError: result.fulfillmentError } : {}),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
