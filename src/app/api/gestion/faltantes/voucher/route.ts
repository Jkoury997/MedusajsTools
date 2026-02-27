import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';
import { medusaRequest } from '@/lib/medusa';

function generateVoucherCode(orderDisplayId: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `VOUCHER-${orderDisplayId}-${random}`;
}

// POST /api/gestion/faltantes/voucher - Crear promoción (voucher) en Medusa y resolver faltante
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { orderId, value, notes } = await req.json();

    if (!orderId || !value) {
      return NextResponse.json(
        { success: false, error: 'orderId y value son requeridos' },
        { status: 400 }
      );
    }

    // Obtener sesión
    const session = await PickingSession.findOne({ orderId, status: 'completed' });
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Sesión no encontrada' },
        { status: 404 }
      );
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

    // Actualizar sesión con resolución voucher
    session.faltanteResolution = 'voucher';
    session.faltanteResolvedAt = new Date();
    session.faltanteNotes = `Voucher: ${promotion.code} - Valor: $${roundedValue}${notes ? ` - ${notes}` : ''}`;
    await session.save();

    // Audit log
    audit({
      action: 'item_missing',
      userName: session.userName,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Voucher creado: ${promotion.code} por $${roundedValue}`,
      metadata: {
        resolution: 'voucher',
        promotionId: promotion.id,
        promotionCode: promotion.code,
        promotionValue: roundedValue,
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
      orderDisplayId: session.orderDisplayId,
    });
  } catch (error) {
    console.error('[Voucher] Error:', error);
    const message = error instanceof Error ? error.message : 'Error al crear voucher';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
