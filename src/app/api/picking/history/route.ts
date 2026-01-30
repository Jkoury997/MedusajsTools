import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingSession } from '@/lib/mongodb/models';

// GET /api/picking/history - Obtener historial de pickings completados
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

    const [sessions, total] = await Promise.all([
      PickingSession.find(query)
        .sort({ completedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      PickingSession.countDocuments(query),
    ]);

    // Stats resumen
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayStats = await PickingSession.aggregate([
      { $match: { status: 'completed', completedAt: { $gte: todayStart } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgDuration: { $avg: '$durationSeconds' },
          totalItems: { $sum: '$totalPicked' },
        },
      },
    ]);

    const stats = todayStats[0] || { count: 0, avgDuration: 0, totalItems: 0 };

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
      todayStats: {
        completedCount: stats.count,
        avgDurationSeconds: Math.round(stats.avgDuration || 0),
        totalItemsPicked: stats.totalItems,
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
