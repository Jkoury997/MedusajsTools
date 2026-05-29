import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';

// GET /api/picking/history - Obtener historial de pickings con métricas completas
export async function GET(req: NextRequest) {
  try {
    const em = await getEm();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = { status: { $in: ['completed', 'cancelled'] } };

    if (userId) query.user = userId;
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

    const [sessions, total, completedSessions, cancelledSessions] = await Promise.all([
      // 1. Sesiones paginadas
      em.find(PickingSession, query, {
        orderBy: { completedAt: 'DESC' },
        offset,
        limit,
        populate: ['items', 'user'],
      }),

      // 2. Conteo total
      em.count(PickingSession, query),

      // 3 + 4. Sesiones completadas del período (para stats globales y por picker)
      em.find(PickingSession, { status: 'completed', ...dateMatch }, { populate: ['user'] }),

      // 5. Sesiones canceladas del período
      em.find(PickingSession, { status: 'cancelled', ...dateMatch }, { populate: ['user'] }),
    ]);

    // 3. Stats globales del período (solo completados) - agregación en JS
    const globalStats = completedSessions.length > 0 ? [completedSessions.reduce(
      (acc, s) => {
        const d = s.durationSeconds ?? 0;
        acc.count += 1;
        acc.totalDuration += d;
        acc.totalItemsPicked += s.totalPicked;
        acc.totalItemsRequired += s.totalRequired;
        acc.minDuration = acc.minDuration === null ? d : Math.min(acc.minDuration, d);
        acc.maxDuration = acc.maxDuration === null ? d : Math.max(acc.maxDuration, d);
        return acc;
      },
      {
        _id: null as null,
        count: 0,
        avgDuration: 0,
        totalDuration: 0,
        totalItemsPicked: 0,
        totalItemsRequired: 0,
        minDuration: null as number | null,
        maxDuration: null as number | null,
      }
    )] : [];
    if (globalStats[0]) {
      globalStats[0].avgDuration = globalStats[0].count > 0 ? globalStats[0].totalDuration / globalStats[0].count : 0;
    }

    // 4. Stats por picker del período (completados) - agregación en JS
    const pickerStatsMap = new Map<string, {
      _id: { userId: string; userName: string };
      completedOrders: number;
      totalItemsPicked: number;
      totalItemsRequired: number;
      totalDuration: number;
      avgDuration: number;
      minDuration: number | null;
      maxDuration: number | null;
      firstPick: Date | null;
      lastPick: Date | null;
    }>();
    for (const s of completedSessions) {
      const key = `${s.user.id}|${s.userName}`;
      let g = pickerStatsMap.get(key);
      if (!g) {
        g = {
          _id: { userId: s.user.id, userName: s.userName },
          completedOrders: 0,
          totalItemsPicked: 0,
          totalItemsRequired: 0,
          totalDuration: 0,
          avgDuration: 0,
          minDuration: null,
          maxDuration: null,
          firstPick: null,
          lastPick: null,
        };
        pickerStatsMap.set(key, g);
      }
      const d = s.durationSeconds ?? 0;
      g.completedOrders += 1;
      g.totalItemsPicked += s.totalPicked;
      g.totalItemsRequired += s.totalRequired;
      g.totalDuration += d;
      g.minDuration = g.minDuration === null ? d : Math.min(g.minDuration, d);
      g.maxDuration = g.maxDuration === null ? d : Math.max(g.maxDuration, d);
      const cAt = s.completedAt ?? null;
      if (cAt) {
        if (g.firstPick === null || cAt < g.firstPick) g.firstPick = cAt;
        if (g.lastPick === null || cAt > g.lastPick) g.lastPick = cAt;
      }
    }
    const pickerStats = Array.from(pickerStatsMap.values()).map(g => ({
      ...g,
      avgDuration: g.completedOrders > 0 ? g.totalDuration / g.completedOrders : 0,
    }));
    pickerStats.sort((a, b) => b.totalItemsPicked - a.totalItemsPicked);

    // 5. Stats de cancelaciones del período - agregación en JS
    const cancelStatsMap = new Map<string, {
      _id: { userId: string; userName: string };
      cancelledCount: number;
      reasons: (string | undefined)[];
    }>();
    for (const s of cancelledSessions) {
      const key = `${s.user.id}|${s.userName}`;
      let c = cancelStatsMap.get(key);
      if (!c) {
        c = {
          _id: { userId: s.user.id, userName: s.userName },
          cancelledCount: 0,
          reasons: [],
        };
        cancelStatsMap.set(key, c);
      }
      c.cancelledCount += 1;
      c.reasons.push(s.cancelReason);
    }
    const cancelStats = Array.from(cancelStatsMap.values());

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
        reasons: c.reasons.filter(Boolean) as string[],
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
      minDuration: number | null;
      maxDuration: number | null;
      firstPick: Date | null;
      lastPick: Date | null;
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
        _id: s.id,
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
        items: s.items.getItems(),
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
