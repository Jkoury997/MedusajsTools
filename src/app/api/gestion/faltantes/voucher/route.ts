import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession, audit } from '@/lib/mongodb/models';
import { medusaRequest } from '@/lib/medusa';

// POST /api/gestion/faltantes/voucher - Crear gift card en Medusa y resolver faltante
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

    // Obtener datos del pedido para region_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderData = await medusaRequest<{ order: any }>(
      `/admin/orders/${orderId}?fields=+shipping_address.*,+customer.*`
    );
    const order = orderData.order;
    const regionId = order.region_id;

    if (!regionId) {
      return NextResponse.json(
        { success: false, error: 'El pedido no tiene region_id' },
        { status: 400 }
      );
    }

    // Crear gift card en Medusa
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const giftCardData = await medusaRequest<{ gift_card: any }>('/admin/gift-cards', {
      method: 'POST',
      body: {
        value: Math.round(value),
        region_id: regionId,
        is_disabled: false,
        metadata: {
          orderId,
          orderDisplayId: session.orderDisplayId,
          reason: 'faltante_compensation',
          notes: notes || '',
        },
      },
    });

    const giftCard = giftCardData.gift_card;

    // Actualizar sesión con resolución voucher
    session.faltanteResolution = 'voucher';
    session.faltanteResolvedAt = new Date();
    session.faltanteNotes = `Voucher: ${giftCard.code} - Valor: $${value}${notes ? ` - ${notes}` : ''}`;
    await session.save();

    // Audit log
    audit({
      action: 'item_missing',
      userName: session.userName,
      orderId,
      orderDisplayId: session.orderDisplayId,
      details: `Voucher creado: ${giftCard.code} por $${value}`,
      metadata: {
        resolution: 'voucher',
        giftCardId: giftCard.id,
        giftCardCode: giftCard.code,
        giftCardValue: value,
        notes,
      },
    });

    // Armar datos para WhatsApp
    const customerName = order.shipping_address?.first_name || order.customer?.first_name || '';
    const phone = order.shipping_address?.phone || '';

    return NextResponse.json({
      success: true,
      giftCard: {
        id: giftCard.id,
        code: giftCard.code,
        value: giftCard.value,
        balance: giftCard.balance,
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
