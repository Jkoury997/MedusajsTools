import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { errorResponse } from '@/lib/http';
import { getPendingOrders, consolidate, MAX_ORDERS_PER_WAVE, LETTERS } from '@/lib/wave';

// GET /api/picking/waves/suggest?max=8
// Propone una ola con los pedidos a preparar más antiguos del depósito central.
export async function GET(req: NextRequest) {
  try {
    await requireSession();

    const maxParam = parseInt(req.nextUrl.searchParams.get('max') || '', 10);
    const max = Math.min(
      Number.isFinite(maxParam) && maxParam > 0 ? maxParam : MAX_ORDERS_PER_WAVE,
      MAX_ORDERS_PER_WAVE
    );

    const pending = await getPendingOrders();
    const suggested = pending.slice(0, max);
    const { lines, breakdown } = consolidate(suggested);

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
