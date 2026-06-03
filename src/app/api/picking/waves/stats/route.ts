import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse } from '@/lib/http';
import { resolveStoreId } from '@/lib/wave';
import { PickingWave } from '@/lib/entities';

// GET /api/picking/waves/stats?storeId=&from=&to= - Métricas de olas (Fase 5)
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const storeId = await resolveStoreId(em, session, req.nextUrl.searchParams.get('storeId'));

    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdAt: Record<string, any> = {};
    createdAt.$gte = from ? new Date(from) : defaultFrom;
    if (to) createdAt.$lte = new Date(to + 'T23:59:59.999Z');

    const waves = await em.find(
      PickingWave,
      { storeId, createdAt },
      { populate: ['orders.items', 'lines'] }
    );

    const completed = waves.filter((w) => w.status === 'completed');
    const cancelled = waves.filter((w) => w.status === 'cancelled');
    const active = waves.filter((w) => ['draft', 'picking', 'sorting', 'ready'].includes(w.status));

    const secs = (a?: Date | null, b?: Date | null) =>
      a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000)) : null;
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0;

    const pickingTimes: number[] = [];
    const sortingTimes: number[] = [];
    let totalOrders = 0;
    let totalUnits = 0;
    let totalMissing = 0;

    for (const w of completed) {
      const p = secs(w.pickingStartedAt, w.sortingStartedAt);
      const s = secs(w.sortingStartedAt, w.completedAt);
      if (p !== null) pickingTimes.push(p);
      if (s !== null) sortingTimes.push(s);
      totalOrders += w.orders.count();
      for (const line of w.lines.getItems()) totalUnits += line.quantityPicked;
      for (const o of w.orders.getItems()) {
        for (const it of o.items.getItems()) totalMissing += it.quantityMissing;
      }
    }

    return NextResponse.json({
      success: true,
      storeId,
      totals: {
        waves: waves.length,
        completed: completed.length,
        cancelled: cancelled.length,
        active: active.length,
        orders: totalOrders,
        units: totalUnits,
        missing: totalMissing,
      },
      averages: {
        pickingSeconds: avg(pickingTimes),
        sortingSeconds: avg(sortingTimes),
        ordersPerWave: completed.length ? Math.round((totalOrders / completed.length) * 10) / 10 : 0,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
