import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import {
  User,
  PickingWave,
  PickingWaveOrder,
  PickingWaveOrderItem,
  PickingWaveLine,
} from '@/lib/entities';
import {
  getPendingOrders,
  consolidate,
  isValidStation,
  nextWaveNumber,
  serializeWave,
  LETTERS,
  MAX_ORDERS_PER_WAVE,
} from '@/lib/wave';

// GET /api/picking/waves?stationId= - Olas activas del depósito (no cerradas)
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const em = await getEm();

    const where: Record<string, unknown> = {
      status: { $in: ['draft', 'picking', 'sorting', 'ready'] },
    };
    const stationId = req.nextUrl.searchParams.get('stationId');
    if (stationId) where.stationId = stationId;

    const waves = await em.find(PickingWave, where, {
      populate: ['orders', 'lines'],
      orderBy: { createdAt: 'DESC' },
    });

    return NextResponse.json({
      success: true,
      waves: waves.map(serializeWave),
      total: waves.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/picking/waves - Crear una ola confirmada (depósito central)
// Body: { orderIds: string[], stationId }
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const body = await req.json();
    const { orderIds, stationId } = body as { orderIds?: string[]; stationId?: string };

    if (!stationId || !isValidStation(stationId)) {
      throw new HttpError(400, 'stationId inválido (esperado: mesa-1 | mesa-2)');
    }
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new HttpError(400, 'orderIds es requerido');
    }
    if (orderIds.length > MAX_ORDERS_PER_WAVE) {
      throw new HttpError(400, `La mesa admite hasta ${MAX_ORDERS_PER_WAVE} pedidos por ola`);
    }
    if (new Set(orderIds).size !== orderIds.length) {
      throw new HttpError(400, 'Hay pedidos repetidos en la ola');
    }

    // Que la mesa no tenga otra ola activa en curso.
    const busy = await em.findOne(PickingWave, {
      stationId,
      status: { $in: ['picking', 'sorting'] },
    });
    if (busy) {
      throw new HttpError(409, `La ${stationId} ya tiene una ola en curso (#${busy.displayNumber})`);
    }

    // Validar que los pedidos estén en el pool a preparar.
    const pending = await getPendingOrders();
    const pendingById = new Map(pending.map((o) => [o.id, o]));
    const selected = orderIds.map((id) => {
      const o = pendingById.get(id);
      if (!o) throw new HttpError(400, `El pedido ${id} no está disponible para preparar`);
      return o;
    });
    // Ordenar por antigüedad (prioridad).
    selected.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const { lines, breakdown } = consolidate(selected);

    const actor = session.userId === 'admin' ? null : await em.findOne(User, { id: session.userId });
    const displayNumber = await nextWaveNumber(em);

    const wave = em.create(PickingWave, {
      displayNumber,
      storeId: '',
      stationId,
      status: 'draft',
      createdByUserId: actor?.id,
      createdByName: actor?.name || 'Depósito',
    });

    breakdown.forEach((b, idx) => {
      const waveOrder = em.create(PickingWaveOrder, {
        wave,
        orderId: b.orderId,
        orderDisplayId: b.orderDisplayId,
        letter: LETTERS[idx],
        priority: idx,
        status: 'pending',
      });
      for (const item of b.items) {
        em.create(PickingWaveOrderItem, {
          waveOrder,
          lineItemId: item.lineItemId,
          variantId: item.variantId,
          sku: item.sku,
          barcode: item.barcode,
          quantityRequired: item.quantityRequired,
        });
      }
    });

    for (const line of lines) {
      em.create(PickingWaveLine, {
        wave,
        variantId: line.variantId,
        sku: line.sku,
        barcode: line.barcode,
        title: line.title,
        quantityRequired: line.quantityRequired,
      });
    }

    await em.persistAndFlush(wave);

    audit({
      action: 'wave_create',
      userName: wave.createdByName,
      userId: actor?.id,
      details: `Ola #${displayNumber} en ${stationId}: ${selected.length} pedidos, ${lines.length} SKUs`,
      metadata: { waveId: wave.id, stationId, orderIds, displayNumber },
    });

    await wave.orders.init({ populate: ['items'] as never });
    await wave.lines.init();

    return NextResponse.json({ success: true, wave: serializeWave(wave) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
