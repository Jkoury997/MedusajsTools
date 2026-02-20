import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession } from '@/lib/mongodb/models';

// GET /api/stats/picking - Stats de rendimiento de picking
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // Default: últimos 30 días si no se especifica rango
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

    // Hoy a las 00:00
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [globalStats, pickerStats, cancelStats, inProgressCount, todayCompleted, todayCancelled, todayInProgress, todayItems] = await Promise.all([
      // 1. Stats globales (completados en el período)
      PickingSession.aggregate([
        { $match: { status: 'completed', ...dateMatch } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgDuration: { $avg: '$durationSeconds' },
            totalDuration: { $sum: '$durationSeconds' },
            totalItemsPicked: { $sum: '$totalPicked' },
            totalItemsRequired: { $sum: '$totalRequired' },
            minDuration: { $min: '$durationSeconds' },
            maxDuration: { $max: '$durationSeconds' },
          },
        },
      ]),

      // 2. Stats por picker (completados en el período)
      PickingSession.aggregate([
        { $match: { status: 'completed', ...dateMatch } },
        {
          $group: {
            _id: { userId: '$userId', userName: '$userName' },
            completedOrders: { $sum: 1 },
            totalItemsPicked: { $sum: '$totalPicked' },
            totalItemsRequired: { $sum: '$totalRequired' },
            totalDuration: { $sum: '$durationSeconds' },
            avgDuration: { $avg: '$durationSeconds' },
            minDuration: { $min: '$durationSeconds' },
            maxDuration: { $max: '$durationSeconds' },
            firstPick: { $min: '$completedAt' },
            lastPick: { $max: '$completedAt' },
          },
        },
        { $sort: { totalItemsPicked: -1 } },
      ]),

      // 3. Stats de cancelaciones en el período
      PickingSession.aggregate([
        { $match: { status: 'cancelled', ...dateMatch } },
        {
          $group: {
            _id: { userId: '$userId', userName: '$userName' },
            cancelledCount: { $sum: 1 },
          },
        },
      ]),

      // 4. Sesiones en progreso (global, sin filtro de fecha)
      PickingSession.countDocuments({ status: 'in_progress' }),

      // 5-8. Stats de hoy
      PickingSession.countDocuments({ status: 'completed', completedAt: { $gte: todayStart } }),
      PickingSession.countDocuments({ status: 'cancelled', cancelledAt: { $gte: todayStart } }),
      PickingSession.countDocuments({ status: 'in_progress', startedAt: { $gte: todayStart } }),
      PickingSession.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$totalPicked' } } },
      ]),
    ]);

    // Procesar stats globales
    const gs = globalStats[0] || {
      count: 0, avgDuration: 0, totalDuration: 0,
      totalItemsPicked: 0, totalItemsRequired: 0,
      minDuration: 0, maxDuration: 0,
    };

    const totalCancelled = cancelStats.reduce(
      (acc: number, c: { cancelledCount: number }) => acc + c.cancelledCount, 0
    );

    // Mapear cancelaciones por picker
    const cancelMap = new Map<string, number>();
    for (const c of cancelStats) {
      cancelMap.set(c._id.userName, c.cancelledCount);
    }

    // Procesar per-picker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perPicker = pickerStats.map((p: any) => {
      const cancelled = cancelMap.get(p._id.userName) || 0;
      const totalOrders = p.completedOrders + cancelled;
      return {
        userId: p._id.userId,
        userName: p._id.userName,
        completedOrders: p.completedOrders,
        cancelledOrders: cancelled,
        totalOrders,
        cancelRate: totalOrders > 0 ? Math.round((cancelled / totalOrders) * 1000) / 10 : 0,
        totalItemsPicked: p.totalItemsPicked,
        accuracy: p.totalItemsRequired > 0
          ? Math.round((p.totalItemsPicked / p.totalItemsRequired) * 1000) / 10
          : 100,
        avgDurationSeconds: Math.round(p.avgDuration),
        avgSecondsPerItem: p.totalItemsPicked > 0 ? Math.round(p.totalDuration / p.totalItemsPicked) : 0,
        firstPickAt: p.firstPick,
        lastPickAt: p.lastPick,
      };
    });

    // Agregar pickers que solo tienen cancelaciones
    for (const c of cancelStats) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exists = perPicker.find((p: any) => p.userName === c._id.userName);
      if (!exists) {
        perPicker.push({
          userId: c._id.userId,
          userName: c._id.userName,
          completedOrders: 0,
          cancelledOrders: c.cancelledCount,
          totalOrders: c.cancelledCount,
          cancelRate: 100,
          totalItemsPicked: 0,
          accuracy: 0,
          avgDurationSeconds: 0,
          avgSecondsPerItem: 0,
          firstPickAt: null,
          lastPickAt: null,
        });
      }
    }

    const periodFrom = dateFrom || defaultFrom.toISOString().split('T')[0];
    const periodTo = dateTo || now.toISOString().split('T')[0];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      period: { from: periodFrom, to: periodTo },
      global: {
        sessionsCompleted: gs.count,
        sessionsCancelled: totalCancelled,
        sessionsInProgress: inProgressCount,
        avgDurationSeconds: Math.round(gs.avgDuration || 0),
        totalDurationSeconds: Math.round(gs.totalDuration || 0),
        totalItemsPicked: gs.totalItemsPicked,
        totalItemsRequired: gs.totalItemsRequired,
        pickAccuracy: gs.totalItemsRequired > 0
          ? Math.round((gs.totalItemsPicked / gs.totalItemsRequired) * 1000) / 10
          : 100,
        avgItemsPerOrder: gs.count > 0 ? Math.round((gs.totalItemsPicked / gs.count) * 10) / 10 : 0,
        avgSecondsPerItem: gs.totalItemsPicked > 0 ? Math.round(gs.totalDuration / gs.totalItemsPicked) : 0,
        fastestPickSeconds: gs.minDuration || 0,
        slowestPickSeconds: gs.maxDuration || 0,
      },
      perPicker,
      today: {
        completed: todayCompleted,
        cancelled: todayCancelled,
        inProgress: todayInProgress,
        itemsPicked: todayItems[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error('[Stats Picking] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener stats de picking' },
      { status: 500 }
    );
  }
}
