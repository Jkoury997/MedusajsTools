import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { medusaRequest, invalidateOrdersCache } from '@/lib/medusa';
import { createFulfillmentForOrder } from '@/lib/fulfillment';
import { requireRole } from '@/lib/session';
import { errorResponse } from '@/lib/http';
import { randomBytes } from 'crypto';

function generateVoucherCode(orderDisplayId: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    random += chars[bytes[i] % chars.length];
  }
  return `VOUCHER-${orderDisplayId}-${random}`;
}

// POST /api/gestion/faltantes/voucher - Crear promoción (voucher) en Medusa y resolver faltante
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin', 'ecommerce');
    const em = await getEm();
    const { orderId, value, notes } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId y value son requeridos' },
        { status: 400 }
      );
    }

    // Validar value: número finito > 0 y <= 1.000.000 (rechaza negativos, strings, NaN)
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
      return NextResponse.json(
        { success: false, error: 'value debe ser un número mayor a 0 y menor o igual a 1.000.000' },
        { status: 400 }
      );
    }

    // Obtener sesión (con items para poder armar el fulfillment con lo pickeado)
    const session = await em.findOne(
      PickingSession,
      { orderId, status: 'completed' },
      { populate: ['items'] }
    );
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    // El voucher COMPENSA el faltante: se toma como si el faltante TAMBIÉN se
    // hubiera pickeado, de modo que el pedido queda COMPLETO (fulfilled) en
    // Medusa y NO vuelve a aparecer para armar (ni en el pool de olas ni en el
    // detalle del pedido). Se cumple la cantidad PEDIDA de cada línea (pickeado
    // + faltante). Idempotente vía fulfillmentStatus.
    async function ensureFulfillment(): Promise<{ created: boolean; error?: string }> {
      if (session!.fulfillmentStatus === 'created') return { created: true };
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await medusaRequest<{ order: any }>(`/admin/orders/${orderId}?fields=+items.*`);
        const fulfillmentItems: { id: string; quantity: number }[] = [];
        for (const it of session!.items.getItems()) {
          // Cantidad pedida = pickeado + faltante (el faltante se toma como pickeado).
          const quantity = it.quantityRequired;
          if (quantity <= 0) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const medusaItem = data.order.items?.find((i: any) => i.id === it.lineItemId);
          if (medusaItem) fulfillmentItems.push({ id: medusaItem.id, quantity });
        }
        if (fulfillmentItems.length === 0) return { created: false };
        await createFulfillmentForOrder(orderId, fulfillmentItems);
        session!.fulfillmentStatus = 'created';
        invalidateOrdersCache();
        return { created: true };
      } catch (fulfillError) {
        console.error('[Voucher] Error creating fulfillment:', fulfillError);
        session!.fulfillmentStatus = 'failed';
        return { created: false, error: fulfillError instanceof Error ? fulfillError.message : String(fulfillError) };
      }
    }

    // Idempotencia: si ya hay un voucher resuelto, no crear otra promoción.
    // Pero igual aseguramos el fulfillment (puede haber quedado sin crear o fallado).
    if (session.faltanteResolution === 'voucher' || (session.voucherCode && session.voucherCode.length > 0)) {
      const fulfillment = await ensureFulfillment();
      await em.flush();
      const existingValue = session.voucherValue ?? 0;
      return NextResponse.json({
        success: true,
        giftCard: {
          id: session.voucherCode || '',
          code: session.voucherCode || '',
          value: existingValue,
          balance: existingValue,
        },
        voucherCode: session.voucherCode || '',
        voucherValue: existingValue,
        orderDisplayId: session.orderDisplayId,
        alreadyResolved: true,
        fulfillmentCreated: fulfillment.created,
        ...(fulfillment.error ? { fulfillmentError: fulfillment.error } : {}),
      });
    }

    // Obtener datos del pedido para currency_code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderData = await medusaRequest<{ order: any }>(
      `/admin/orders/${orderId}?fields=currency_code,+shipping_address.*,+customer.*`
    );
    const order = orderData.order;
    const currencyCode = order.currency_code || 'ars';

    const voucherCode = generateVoucherCode(session.orderDisplayId || 0);
    const roundedValue = Math.round(value);

    // Crear promoción (voucher) en Medusa v2 via Promotions API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promoData = await medusaRequest<{ promotion: any }>('/admin/promotions', {
      method: 'POST',
      body: {
        code: voucherCode,
        type: 'standard',
        is_automatic: false,
        status: 'active',
        application_method: {
          type: 'fixed',
          target_type: 'order',
          value: roundedValue,
          currency_code: currencyCode,
          description: `Compensación por faltante - Pedido #${session.orderDisplayId}`,
        },
      },
    });

    const promotion = promoData.promotion;

    // Actualizar sesión con resolución voucher.
    // Los campos estructurados son la fuente de verdad; la nota humana se mantiene por compat.
    session.voucherCode = voucherCode;
    session.voucherValue = roundedValue;
    session.faltanteResolution = 'voucher';
    session.faltanteResolvedAt = new Date();
    session.faltanteNotes = `Voucher: ${promotion.code} - Valor: $${roundedValue}${notes ? ` - ${notes}` : ''}`;

    // Cerrar el cumplimiento en Medusa con lo pickeado (el faltante va por voucher).
    const fulfillment = await ensureFulfillment();
    await em.flush();

    // Audit log
    audit({
      action: 'item_missing',
      userName: session.userName,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Voucher creado: ${promotion.code} por $${roundedValue}${fulfillment.created ? ' - Fulfillment creado' : ''}`,
      metadata: {
        resolution: 'voucher',
        promotionId: promotion.id,
        promotionCode: promotion.code,
        promotionValue: roundedValue,
        fulfillmentCreated: fulfillment.created,
        ...(fulfillment.error ? { fulfillmentError: fulfillment.error } : {}),
        notes,
      },
    });

    // Armar datos para WhatsApp
    const customerName = order.shipping_address?.first_name || order.customer?.first_name || '';
    const phone = order.shipping_address?.phone || '';

    // Mantener misma estructura de respuesta para el frontend
    return NextResponse.json({
      success: true,
      giftCard: {
        id: promotion.id,
        code: promotion.code,
        value: roundedValue,
        balance: roundedValue,
      },
      customer: {
        name: customerName,
        phone,
      },
      voucherCode,
      voucherValue: roundedValue,
      orderDisplayId: session.orderDisplayId,
      fulfillmentCreated: fulfillment.created,
      ...(fulfillment.error ? { fulfillmentError: fulfillment.error } : {}),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
