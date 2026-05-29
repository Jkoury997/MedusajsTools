import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';

// Formatea una fecha como '%Y-%m-%d' en UTC (equivalente a $dateToString de Mongo).
function toDateStringUTC(d: Date): string {
  return d.toISOString().split('T')[0];
}

// GET /api/stats/faltantes - Estadísticas de productos faltantes
export async function GET(req: NextRequest) {
  try {
    const em = await getEm();

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // Default: últimos 30 días
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateMatch: Record<string, any> = {};
    if (dateFrom || dateTo) {
      dateMatch.completedAt = {};
      if (dateFrom) dateMatch.completedAt.$gte = new Date(dateFrom);
      if (dateTo) dateMatch.completedAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    } else {
      dateMatch.completedAt = { $gte: defaultFrom };
    }

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [periodSessions, trendSessions, todaySessions] = await Promise.all([
      // Sesiones completadas en el período (con items, para ranking/picker/global)
      em.find(
        PickingSession,
        { status: 'completed', ...dateMatch },
        { populate: ['items'] }
      ),
      // Sesiones completadas en los últimos 14 días (tendencia diaria)
      em.find(
        PickingSession,
        { status: 'completed', completedAt: { $gte: fourteenDaysAgo } }
      ),
      // Sesiones completadas hoy
      em.find(
        PickingSession,
        { status: 'completed', completedAt: { $gte: todayStart } }
      ),
    ]);

    // 1. Ranking de productos más faltantes (por SKU/barcode/variantId)
    //    $unwind items -> $match quantityMissing > 0 -> $group por {sku,barcode,variantId}
    interface ProductAgg {
      sku: string | undefined;
      barcode: string | undefined;
      variantId: string | undefined;
      totalMissing: number;
      occurrences: number;
      orders: Set<number>; // $addToSet orderDisplayId
    }
    const productMap = new Map<string, ProductAgg>();

    // 2. Faltantes por picker: $group por {userId, userName}
    interface PickerAgg {
      userId: string;
      userName: string;
      totalMissing: number;
      ordersWithMissing: Set<string>; // $addToSet orderId
    }
    const pickerMap = new Map<string, PickerAgg>();

    // 3. Totales globales (por sesión, sin unwind)
    let totalSessions = 0;
    let globalTotalMissing = 0;
    let sessionsWithMissing = 0;
    let totalItemsRequired = 0;

    for (const session of periodSessions) {
      // Globales (a nivel sesión)
      totalSessions += 1;
      globalTotalMissing += session.totalMissing;
      if (session.totalMissing > 0) sessionsWithMissing += 1;
      totalItemsRequired += session.totalRequired;

      // Unwind de items con quantityMissing > 0
      const items = session.items.getItems();
      for (const item of items) {
        if (item.quantityMissing > 0) {
          // Ranking de productos
          const pKey = `${item.sku ?? ''}|${item.barcode ?? ''}|${item.variantId ?? ''}`;
          let pAgg = productMap.get(pKey);
          if (!pAgg) {
            pAgg = {
              sku: item.sku,
              barcode: item.barcode,
              variantId: item.variantId,
              totalMissing: 0,
              occurrences: 0,
              orders: new Set<number>(),
            };
            productMap.set(pKey, pAgg);
          }
          pAgg.totalMissing += item.quantityMissing;
          pAgg.occurrences += 1;
          pAgg.orders.add(session.orderDisplayId);

          // Faltantes por picker
          const uKey = `${session.user.id}|${session.userName}`;
          let uAgg = pickerMap.get(uKey);
          if (!uAgg) {
            uAgg = {
              userId: session.user.id,
              userName: session.userName,
              totalMissing: 0,
              ordersWithMissing: new Set<string>(),
            };
            pickerMap.set(uKey, uAgg);
          }
          uAgg.totalMissing += item.quantityMissing;
          uAgg.ordersWithMissing.add(session.orderId);
        }
      }
    }

    const productRanking = Array.from(productMap.values())
      .sort((a, b) => b.totalMissing - a.totalMissing)
      .slice(0, 50);

    const pickerStats = Array.from(pickerMap.values())
      .sort((a, b) => b.totalMissing - a.totalMissing);

    // 4. Tendencia diaria de faltantes (últimos 14 días), group por fecha %Y-%m-%d
    interface TrendAgg {
      totalMissing: number;
      sessions: number;
      sessionsWithMissing: number;
    }
    const trendMap = new Map<string, TrendAgg>();
    for (const s of trendSessions) {
      if (!s.completedAt) continue;
      const dateKey = toDateStringUTC(s.completedAt);
      let t = trendMap.get(dateKey);
      if (!t) {
        t = { totalMissing: 0, sessions: 0, sessionsWithMissing: 0 };
        trendMap.set(dateKey, t);
      }
      t.totalMissing += s.totalMissing;
      t.sessions += 1;
      if (s.totalMissing > 0) t.sessionsWithMissing += 1;
    }
    const dailyTrendSorted = Array.from(trendMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    // 5. Faltantes de hoy
    let todayTotalMissing = 0;
    let todaySessionsWithMissing = 0;
    for (const s of todaySessions) {
      todayTotalMissing += s.totalMissing;
      if (s.totalMissing > 0) todaySessionsWithMissing += 1;
    }

    const gs = {
      totalSessions,
      totalMissing: globalTotalMissing,
      sessionsWithMissing,
      totalItemsRequired,
    };

    const ts = { totalMissing: todayTotalMissing, sessionsWithMissing: todaySessionsWithMissing };

    const periodFrom = dateFrom || defaultFrom.toISOString().split('T')[0];
    const periodTo = dateTo || now.toISOString().split('T')[0];

    return NextResponse.json({
      success: true,
      period: { from: periodFrom, to: periodTo },
      global: {
        totalMissing: gs.totalMissing,
        totalSessions: gs.totalSessions,
        sessionsWithMissing: gs.sessionsWithMissing,
        missingRate: gs.totalItemsRequired > 0
          ? Math.round((gs.totalMissing / gs.totalItemsRequired) * 1000) / 10
          : 0,
      },
      today: {
        totalMissing: ts.totalMissing,
        sessionsWithMissing: ts.sessionsWithMissing,
      },
      productRanking: productRanking.map((p) => ({
        sku: p.sku || null,
        barcode: p.barcode || null,
        variantId: p.variantId || null,
        totalMissing: p.totalMissing,
        occurrences: p.occurrences,
        orderCount: p.orders.size,
      })),
      perPicker: pickerStats.map((p) => ({
        userId: p.userId,
        userName: p.userName,
        totalMissing: p.totalMissing,
        ordersWithMissing: p.ordersWithMissing.size,
      })),
      dailyTrend: dailyTrendSorted.map(([date, d]) => ({
        date,
        totalMissing: d.totalMissing,
        sessions: d.sessions,
        sessionsWithMissing: d.sessionsWithMissing,
      })),
    });
  } catch (error) {
    console.error('[Stats Faltantes] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener stats de faltantes' },
      { status: 500 }
    );
  }
}
