import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession } from '@/lib/mongodb/models';

// GET /api/picking/history - Obtener historial de pickings con métricas completas
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = { status: { $in: ['completed', 'cancelled'] } };

    if (userId) query.userId = userId;
    if (dateFrom || dateTo) {
      query.completedAt = {};
      if (dateFrom) query.completedAt.$gte = new Date(dateFrom);
      if (dateTo) query.completedAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateMatch: Record<string, any> = {};
    if (dateFrom || dateTo) {
      dateMatch.completedAt = {};
      if (dateFrom) dateMatch.completedAt.$gte = new Date(dateFrom);
      if (dateTo) dateMatch.completedAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const [sessions, total, globalStats, pickerStats, cancelStats] = await Promise.all([
      // 1. Sesiones paginadas
      PickingSession.find(query)
        .sort({ completedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),

      // 2. Conteo total
      PickingSession.countDocuments(query),

      // 3. Stats globales del período (solo completados)
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

      // 4. Stats por picker del período (completados)
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

      // 5. Stats de cancelaciones del período
      PickingSession.aggregate([
        { $match: { status: 'cancelled', ...dateMatch } },
        {
          $group: {
            _id: { userId: '$userId', userName: '$userName' },
            cancelledCount: { $sum: 1 },
            reasons: { $push: '$cancelReason' },
          },
        },
      ]),
    ]);

    // Procesar stats globales
    const gs = globalStats[0] || {
      count: 0, avgDuration: 0, totalDuration: 0,
      totalItemsPicked: 0, totalItemsRequired: 0,
      minDuration: 0, maxDuration: 0,
    };

    // Calcular promedios globales
    const avgItemsPerOrder = gs.count > 0 ? Math.round((gs.totalItemsPicked / gs.count) * 10) / 10 : 0;
    const avgSecondsPerItem = gs.totalItemsPicked > 0 ? Math.round(gs.totalDuration / gs.totalItemsPicked) : 0;
    const pickAccuracy = gs.totalItemsRequired > 0
      ? Math.round((gs.totalItemsPicked / gs.totalItemsRequired) * 1000) / 10
      : 100;

    // Mapear cancelaciones por picker para merge
    const cancelMap = new Map<string, { cancelledCount: number; reasons: string[] }>();
    for (const c of cancelStats) {
      cancelMap.set(c._id.userName, {
        cancelledCount: c.cancelledCount,
        reasons: c.reasons.filter(Boolean),
      });
    }

    // Procesar stats por picker
    const pickerDetails = pickerStats.map((p: {
      _id: { userId: string; userName: string };
      completedOrders: number;
      totalItemsPicked: number;
      totalItemsRequired: number;
      totalDuration: number;
      avgDuration: number;
      minDuration: number;
      maxDuration: number;
      firstPick: Date;
      lastPick: Date;
    }) => {
      const cancels = cancelMap.get(p._id.userName) || { cancelledCount: 0, reasons: [] };
      const totalOrders = p.completedOrders + cancels.cancelledCount;
      return {
        userId: p._id.userId,
        userName: p._id.userName,
        completedOrders: p.completedOrders,
        cancelledOrders: cancels.cancelledCount,
        totalOrders,
        cancelRate: totalOrders > 0
          ? Math.round((cancels.cancelledCount / totalOrders) * 1000) / 10
          : 0,
        totalItemsPicked: p.totalItemsPicked,
        totalItemsRequired: p.totalItemsRequired,
        accuracy: p.totalItemsRequired > 0
          ? Math.round((p.totalItemsPicked / p.totalItemsRequired) * 1000) / 10
          : 100,
        totalDurationSeconds: Math.round(p.totalDuration),
        avgDurationSeconds: Math.round(p.avgDuration),
        minDurationSeconds: p.minDuration,
        maxDurationSeconds: p.maxDuration,
        avgItemsPerOrder: p.completedOrders > 0
          ? Math.round((p.totalItemsPicked / p.completedOrders) * 10) / 10
          : 0,
        avgSecondsPerItem: p.totalItemsPicked > 0
          ? Math.round(p.totalDuration / p.totalItemsPicked)
          : 0,
        firstPickAt: p.firstPick,
        lastPickAt: p.lastPick,
      };
    });

    // Agregar pickers que solo tienen cancelaciones (sin completados)
    for (const c of cancelStats) {
      const exists = pickerDetails.find(
        (p: { userName: string }) => p.userName === c._id.userName
      );
      if (!exists) {
        pickerDetails.push({
          userId: c._id.userId,
          userName: c._id.userName,
          completedOrders: 0,
          cancelledOrders: c.cancelledCount,
          totalOrders: c.cancelledCount,
          cancelRate: 100,
          totalItemsPicked: 0,
          totalItemsRequired: 0,
          accuracy: 0,
          totalDurationSeconds: 0,
          avgDurationSeconds: 0,
          minDurationSeconds: 0,
          maxDurationSeconds: 0,
          avgItemsPerOrder: 0,
          avgSecondsPerItem: 0,
          firstPickAt: null as unknown as Date,
          lastPickAt: null as unknown as Date,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessions: sessions.map(s => ({
        _id: s._id,
        orderId: s.orderId,
        orderDisplayId: s.orderDisplayId,
        status: s.status,
        userName: s.userName,
        completedByName: s.completedByName,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationSeconds: s.durationSeconds,
        totalRequired: s.totalRequired,
        totalPicked: s.totalPicked,
        cancelReason: s.cancelReason,
        cancelledAt: s.cancelledAt,
        items: s.items,
      })),
      total,
      // Stats globales del período
      periodStats: {
        completedCount: gs.count,
        avgDurationSeconds: Math.round(gs.avgDuration || 0),
        totalDurationSeconds: Math.round(gs.totalDuration || 0),
        totalItemsPicked: gs.totalItemsPicked,
        totalItemsRequired: gs.totalItemsRequired,
        avgItemsPerOrder,
        avgSecondsPerItem,
        pickAccuracy,
        fastestPickSeconds: gs.minDuration || 0,
        slowestPickSeconds: gs.maxDuration || 0,
        cancelledCount: cancelStats.reduce(
          (acc: number, c: { cancelledCount: number }) => acc + c.cancelledCount, 0
        ),
      },
      // Stats por picker
      pickerStats: pickerDetails,
      // Backwards compat
      todayStats: {
        completedCount: gs.count,
        avgDurationSeconds: Math.round(gs.avgDuration || 0),
        totalItemsPicked: gs.totalItemsPicked,
      },
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener historial' },
      { status: 500 }
    );
  }
}
