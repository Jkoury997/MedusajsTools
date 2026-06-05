import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { PickingWave } from '@/lib/entities';
import { serializeWave, attachLineDetails } from '@/lib/wave';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadWaveForActor(_req: NextRequest, id: string) {
  const session = await requireSession();
  const em = await getEm();
  const wave = await em.findOne(PickingWave, { id }, { populate: ['orders.items', 'lines'] });
  if (!wave) throw new HttpError(404, 'Ola no encontrada');
  return { em, session, wave };
}

// GET /api/picking/waves/:id - Detalle de la ola (consolidado + pedidos/letras)
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { wave } = await loadWaveForActor(req, id);
    const detailed = await attachLineDetails(serializeWave(wave));
    return NextResponse.json({ success: true, wave: detailed });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/picking/waves/:id - Cancelar la ola (libera la mesa)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { em, wave } = await loadWaveForActor(req, id);

    if (wave.status === 'completed' || wave.status === 'cancelled') {
      throw new HttpError(400, 'La ola ya está cerrada');
    }

    let reason = '';
    try {
      reason = (await req.json())?.reason?.trim() || '';
    } catch {
      /* body vacío */
    }
    if (reason.length < 3) {
      throw new HttpError(400, 'Tenés que poner una razón para cancelar (mínimo 3 caracteres)');
    }

    wave.status = 'cancelled';
    wave.cancelReason = reason;
    wave.cancelledAt = new Date();
    await em.flush();

    audit({
      action: 'wave_cancel',
      userName: wave.createdByName,
      userId: wave.createdByUserId,
      details: `Ola #${wave.displayNumber} cancelada: ${reason}`,
      metadata: { waveId: wave.id },
    });

    return NextResponse.json({ success: true, wave: serializeWave(wave) });
  } catch (error) {
    return errorResponse(error);
  }
}
