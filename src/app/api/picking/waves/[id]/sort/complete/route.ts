import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { PickingWave } from '@/lib/entities';
import { serializeWave } from '@/lib/wave';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/picking/waves/:id/sort/complete - Cerrar la clasificación de toda la ola.
// Calcula el faltante de cada pedido (= requerido - clasificado) y deja la ola "ready".
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const { id } = await params;

    const result = await em.transactional(async (tem) => {
      const wave = await tem.findOne(
        PickingWave,
        { id },
        { populate: ['orders.items'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!wave) throw new HttpError(404, 'Ola no encontrada');
      if (wave.status !== 'sorting') {
        throw new HttpError(400, `La ola está en "${wave.status}", no en clasificación`);
      }

      let totalMissing = 0;
      for (const order of wave.orders.getItems()) {
        for (const it of order.items.getItems()) {
          it.quantityMissing = Math.max(0, it.quantityRequired - it.quantitySorted);
          totalMissing += it.quantityMissing;
        }
        order.status = 'ready';
        if (!order.readyAt) order.readyAt = new Date();
      }
      wave.status = 'ready';
      await tem.flush();

      audit({
        action: 'wave_order_ready',
        userName: session.userId,
        userId: session.userId === 'admin' ? undefined : session.userId,
        details: `Ola #${wave.displayNumber}: clasificación cerrada, ola lista (faltante total ${totalMissing})`,
        metadata: { waveId: wave.id, totalMissing },
      });

      return serializeWave(wave);
    });

    return NextResponse.json({ success: true, wave: result });
  } catch (error) {
    return errorResponse(error);
  }
}
