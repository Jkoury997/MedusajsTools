import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { PickingWave } from '@/lib/entities';
import { resolveStoreId, serializeWave } from '@/lib/wave';

interface RouteParams {
  params: Promise<{ id: string; orderId: string }>;
}

// POST /api/picking/waves/:id/orders/:orderId/ready - Marcar una letra como lista.
// Cierra el pedido aunque tenga faltante (faltante = requerido - clasificado).
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const { id, orderId } = await params;

    const result = await em.transactional(async (tem) => {
      const wave = await tem.findOne(
        PickingWave,
        { id },
        { populate: ['orders.items', 'lines'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!wave) throw new HttpError(404, 'Ola no encontrada');
      await resolveStoreId(tem, session, wave.storeId);
      if (wave.status !== 'sorting') {
        throw new HttpError(400, `La ola está en "${wave.status}", no en clasificación`);
      }

      const order = wave.orders.getItems().find((o) => o.orderId === orderId);
      if (!order) throw new HttpError(404, 'El pedido no pertenece a esta ola');

      let totalMissing = 0;
      for (const it of order.items.getItems()) {
        it.quantityMissing = Math.max(0, it.quantityRequired - it.quantitySorted);
        totalMissing += it.quantityMissing;
      }
      order.status = 'ready';
      order.readyAt = new Date();

      // Si todas las letras quedaron listas, la ola pasa a "ready".
      if (wave.orders.getItems().every((o) => o.status === 'ready')) {
        wave.status = 'ready';
      }
      await tem.flush();

      audit({
        action: 'wave_order_ready',
        userName: session.userId,
        userId: session.userId === 'admin' ? undefined : session.userId,
        orderId: order.orderId,
        orderDisplayId: order.orderDisplayId,
        details: `Ola #${wave.displayNumber}: letra ${order.letter} lista (faltante ${totalMissing})`,
        metadata: { waveId: wave.id, letter: order.letter, totalMissing },
      });

      return serializeWave(wave);
    });

    return NextResponse.json({ success: true, wave: result });
  } catch (error) {
    return errorResponse(error);
  }
}
