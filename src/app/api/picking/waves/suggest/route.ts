import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse } from '@/lib/http';
import {
  resolveStoreId,
  getPendingStorePickupOrders,
  consolidate,
  MAX_ORDERS_PER_WAVE,
  LETTERS,
} from '@/lib/wave';

// GET /api/picking/waves/suggest?storeId=&max=8
// Propone una ola con los pedidos pendientes más antiguos de la tienda.
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const storeId = await resolveStoreId(em, session, req.nextUrl.searchParams.get('storeId'));

    const maxParam = parseInt(req.nextUrl.searchParams.get('max') || '', 10);
    const max = Math.min(
      Number.isFinite(maxParam) && maxParam > 0 ? maxParam : MAX_ORDERS_PER_WAVE,
      MAX_ORDERS_PER_WAVE
    );

    const pending = await getPendingStorePickupOrders(storeId);
    const suggested = pending.slice(0, max);
    const { lines, breakdown } = consolidate(suggested);

    // Asignar letra tentativa por orden de prioridad (antigüedad).
    const orders = breakdown.map((b, idx) => ({
      letter: LETTERS[idx],
      priority: idx,
      orderId: b.orderId,
      orderDisplayId: b.orderDisplayId,
      createdAt: b.createdAt,
      itemCount: b.items.reduce((s, i) => s + i.quantityRequired, 0),
    }));

    return NextResponse.json({
      success: true,
      storeId,
      pendingCount: pending.length,
      suggestion: {
        orders,
        lines: lines.sort((a, b) => b.quantityRequired - a.quantityRequired),
        totalUnits: lines.reduce((s, l) => s + l.quantityRequired, 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
