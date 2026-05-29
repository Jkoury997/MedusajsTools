import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { errorResponse } from '@/lib/http';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/unpick - Quitar item (-1)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const { lineItemId } = await req.json();

    const result = await em.transactional(async (tem) => {
      const session = await tem.findOne(PickingSession, {
        orderId,
        status: 'in_progress',
      }, { populate: ['items', 'user'], lockMode: LockMode.PESSIMISTIC_WRITE });

      if (!session) {
        return { error: 'not_found' as const };
      }

      const items = session.items.getItems();

      const item = items.find(i => i.lineItemId === lineItemId);

      if (!item || item.quantityPicked <= 0) {
        return { error: 'bad_request' as const, message: 'No hay items para quitar' };
      }

      item.quantityPicked -= 1;
      session.totalPicked = items.reduce((sum, i) => sum + i.quantityPicked, 0);

      await tem.flush();

      audit({
        action: 'item_unpick',
        userName: session.userName,
        userId: session.user?.id,
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: `Unpick item ${item.sku || item.lineItemId} (${item.quantityPicked}/${item.quantityRequired})`,
        metadata: { lineItemId: item.lineItemId, sku: item.sku, qty: item.quantityPicked },
      });

      const totalRequired = items.reduce((sum, i) => sum + i.quantityRequired, 0);
      const totalPicked = session.totalPicked;
      const isComplete = items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
      const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

      return {
        session: {
          id: session.id,
          items,
          totalRequired,
          totalPicked,
          isComplete,
          progressPercent: totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 0,
          elapsedSeconds: elapsed,
        },
      };
    });

    if ('error' in result) {
      if (result.error === 'not_found') {
        return NextResponse.json(
          { success: false, error: 'No hay sesión activa' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      session: result.session,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
