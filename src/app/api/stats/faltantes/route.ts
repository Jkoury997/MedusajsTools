import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession } from '@/lib/mongodb/models';

// GET /api/stats/faltantes - Estadísticas de productos faltantes
export async function GET(req: NextRequest) {
  try {
    await connectDB();

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

    const [productRanking, pickerStats, globalStats, dailyTrend, todayStats] = await Promise.all([
      // 1. Ranking de productos más faltantes (por SKU/barcode)
      PickingSession.aggregate([
        { $match: { status: 'completed', ...dateMatch } },
        { $unwind: '$items' },
        { $match: { 'items.quantityMissing': { $gt: 0 } } },
        {
          $group: {
            _id: {
              sku: '$items.sku',
              barcode: '$items.barcode',
              variantId: '$items.variantId',
            },
            totalMissing: { $sum: '$items.quantityMissing' },
            occurrences: { $sum: 1 },
            orders: { $addToSet: '$orderDisplayId' },
          },
        },
        { $sort: { totalMissing: -1 } },
        { $limit: 50 },
      ]),

      // 2. Faltantes por picker
      PickingSession.aggregate([
        { $match: { status: 'completed', ...dateMatch } },
        { $unwind: '$items' },
        { $match: { 'items.quantityMissing': { $gt: 0 } } },
        {
          $group: {
            _id: { userId: '$userId', userName: '$userName' },
            totalMissing: { $sum: '$items.quantityMissing' },
            ordersWithMissing: { $addToSet: '$orderId' },
          },
        },
        { $sort: { totalMissing: -1 } },
      ]),

      // 3. Totales globales
      PickingSession.aggregate([
        { $match: { status: 'completed', ...dateMatch } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            totalMissing: { $sum: '$totalMissing' },
            sessionsWithMissing: {
              $sum: { $cond: [{ $gt: ['$totalMissing', 0] }, 1, 0] },
            },
            totalItemsRequired: { $sum: '$totalRequired' },
          },
        },
      ]),

      // 4. Tendencia diaria de faltantes (últimos 14 días)
      PickingSession.aggregate([
        {
          $match: {
            status: 'completed',
            completedAt: { $gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$completedAt' },
            },
            totalMissing: { $sum: '$totalMissing' },
            sessions: { $sum: 1 },
            sessionsWithMissing: {
              $sum: { $cond: [{ $gt: ['$totalMissing', 0] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 5. Faltantes de hoy
      PickingSession.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: todayStart } } },
        {
          $group: {
            _id: null,
            totalMissing: { $sum: '$totalMissing' },
            sessionsWithMissing: {
              $sum: { $cond: [{ $gt: ['$totalMissing', 0] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const gs = globalStats[0] || {
      totalSessions: 0,
      totalMissing: 0,
      sessionsWithMissing: 0,
      totalItemsRequired: 0,
    };

    const ts = todayStats[0] || { totalMissing: 0, sessionsWithMissing: 0 };

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
      productRanking: productRanking.map((p: any) => ({
        sku: p._id.sku || null,
        barcode: p._id.barcode || null,
        variantId: p._id.variantId || null,
        totalMissing: p.totalMissing,
        occurrences: p.occurrences,
        orderCount: p.orders?.length ?? 0,
      })),
      perPicker: pickerStats.map((p: any) => ({
        userId: p._id.userId,
        userName: p._id.userName,
        totalMissing: p.totalMissing,
        ordersWithMissing: p.ordersWithMissing?.length ?? 0,
      })),
      dailyTrend: dailyTrend.map((d: any) => ({
        date: d._id,
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
