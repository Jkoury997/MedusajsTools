import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { errorResponse } from '@/lib/http';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

type SyncItem = {
  lineItemId: string;
  quantityPicked?: number;
  quantityMissing?: number;
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));

/**
 * POST /api/picking/session/:orderId/sync
 *
 * Reconciliación offline: fija las cantidades ABSOLUTAS pickeadas/faltantes de
 * cada item al valor que trae el cliente (acumulado mientras estuvo sin señal).
 * Es idempotente por diseño: aplicar el mismo estado dos veces no cambia nada,
 * así evitamos el doble conteo al reintentar la sincronización.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const body = (await req.json()) as { items?: SyncItem[] };
    const incoming = Array.isArray(body?.items) ? body.items : [];

    const result = await em.transactional(async (tem) => {
      const session = await tem.findOne(
        PickingSession,
        { orderId, status: 'in_progress' },
        { populate: ['items', 'user'], lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!session) return { error: 'not_found' as const };

      const items = session.items.getItems();
      const byId = new Map(incoming.map((i) => [i.lineItemId, i]));
      let changed = 0;

      for (const item of items) {
        const inc = byId.get(item.lineItemId);
        if (!inc) continue;

        const required = item.quantityRequired;
        const nextPicked =
          inc.quantityPicked != null ? clamp(inc.quantityPicked, 0, required) : item.quantityPicked;
        const nextMissing =
          inc.quantityMissing != null
            ? clamp(inc.quantityMissing, 0, Math.max(0, required - nextPicked))
            : item.quantityMissing || 0;

        if (nextPicked !== item.quantityPicked || (item.quantityMissing || 0) !== nextMissing) {
          changed++;
        }
        if (nextPicked > 0 && nextPicked !== item.quantityPicked) {
          item.pickedAt = new Date();
          item.scanMethod = 'offline-sync';
        }
        item.quantityPicked = nextPicked;
        item.quantityMissing = nextMissing;
      }

      session.totalPicked = items.reduce((s, i) => s + i.quantityPicked, 0);
      session.totalMissing = items.reduce((s, i) => s + (i.quantityMissing || 0), 0);

      await tem.flush();

      const totalRequired = items.reduce((s, i) => s + i.quantityRequired, 0);
      const totalPicked = session.totalPicked;
      const totalMissing = session.totalMissing;
      const isComplete = items.every(
        (i) => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired,
      );
      const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

      if (changed > 0) {
        audit({
          action: 'session_sync_offline',
          userName: session.userName,
          userId: session.user?.id,
          orderId,
          orderDisplayId: session.orderDisplayId,
          details: `Sincronización offline: ${changed} item(s) reconciliados (picked=${totalPicked}, faltantes=${totalMissing})`,
          metadata: { changed, totalPicked, totalMissing },
        });
      }

      return {
        session: {
          id: session.id,
          items,
          totalRequired,
          totalPicked,
          totalMissing,
          isComplete,
          progressPercent:
            totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
          elapsedSeconds: elapsed,
        },
      };
    });

    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: 'No hay sesión activa' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, session: result.session });
  } catch (error) {
    return errorResponse(error);
  }
}
