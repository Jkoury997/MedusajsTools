import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { invalidateOrdersCache } from '@/lib/medusa';
import { PickingWave, User } from '@/lib/entities';
import { serializeWave } from '@/lib/wave';
import { finalizeWaveOrder, type FinalizeResult } from '@/lib/wave-complete';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/picking/waves/:id/complete - Cerrar la ola: materializa cada letra como
// PickingSession completada + fulfillment (Fase 4). Idempotente y reintentable.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const { id } = await params;

    const wave = await em.findOne(PickingWave, { id }, { populate: ['orders.items'] });
    if (!wave) throw new HttpError(404, 'Ola no encontrada');

    if (wave.status !== 'ready') {
      throw new HttpError(400, `La ola está en "${wave.status}"; cerrá la clasificación antes`);
    }

    // La PickingSession necesita un usuario real. Usamos el actor; si es el login
    // admin (sin User propio), caemos al creador de la ola o a un admin del sistema.
    const actorId = session.userId === 'admin' ? wave.createdByUserId : session.userId;
    const user =
      (actorId ? await em.findOne(User, { id: actorId }) : null) ||
      (await em.findOne(User, { role: 'admin' })) ||
      // find (no findOne) porque MikroORM prohíbe findOne con where vacío.
      (await em.find(User, {}, { limit: 1 }))[0];
    if (!user) {
      throw new HttpError(400, 'No hay ningún usuario en el sistema para registrar el cierre');
    }

    const results: FinalizeResult[] = [];
    for (const order of wave.orders.getItems()) {
      results.push(await finalizeWaveOrder(em, order, user, wave));
    }

    // La ola se completa solo si ninguna letra quedó con fulfillment fallido.
    const anyFailed = results.some((r) => r.fulfillmentError);
    if (!anyFailed) {
      wave.status = 'completed';
      wave.completedAt = new Date();
      await em.flush();
    }

    // Los pedidos cambiaron de estado en Medusa: invalidar el caché.
    invalidateOrdersCache();

    audit({
      action: 'wave_order_ready',
      userName: user.name,
      userId: user.id,
      details: `Ola #${wave.displayNumber} cerrada: ${results.filter((r) => r.fulfillmentCreated).length} despachados, ${results.filter((r) => r.totalMissing > 0).length} con faltante`,
      metadata: { waveId: wave.id, results },
    });

    return NextResponse.json({
      success: !anyFailed,
      wave: serializeWave(wave),
      results,
      message: anyFailed
        ? 'Algunas letras no se pudieron despachar; reintentá el cierre'
        : 'Ola cerrada: pedidos listos en el flujo de envío',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
