import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { PickingWave } from '@/lib/entities';
import { resolveStoreId, serializeWave } from '@/lib/wave';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/picking/waves/:id/pick/complete - Cerrar la recolección y pasar a sorting
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const { id } = await params;

    const result = await em.transactional(async (tem) => {
      const wave = await tem.findOne(
        PickingWave,
        { id },
        { populate: ['lines', 'orders.items'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!wave) throw new HttpError(404, 'Ola no encontrada');
      await resolveStoreId(tem, session, wave.storeId);

      if (!['draft', 'picking'].includes(wave.status)) {
        throw new HttpError(400, `La ola ya está en "${wave.status}"`);
      }

      // Faltante de la recolección = lo que no se llegó a juntar.
      let totalShort = 0;
      for (const line of wave.lines.getItems()) {
        line.quantityShort = Math.max(0, line.quantityRequired - line.quantityPicked);
        totalShort += line.quantityShort;
      }

      wave.status = 'sorting';
      wave.sortingStartedAt = new Date();
      // Marcar cada pedido como en clasificación.
      for (const o of wave.orders.getItems()) o.status = 'sorting';
      await tem.flush();

      audit({
        action: 'wave_pick_complete',
        userName: session.userId,
        userId: session.userId === 'admin' ? undefined : session.userId,
        details: `Ola #${wave.displayNumber}: recolección cerrada (faltante ${totalShort})`,
        metadata: { waveId: wave.id, totalShort },
      });

      return serializeWave(wave);
    });

    return NextResponse.json({ success: true, wave: result });
  } catch (error) {
    return errorResponse(error);
  }
}
