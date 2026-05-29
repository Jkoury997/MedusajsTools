import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';

// GET /api/stats/picking - Stats de rendimiento de picking
export async function GET(req: NextRequest) {
  try {
    const em = await getEm();

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

    // Filtro de fecha para cancelaciones (usan cancelledAt, no completedAt)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cancelDateMatch: Record<string, any> = {};
    if (dateFrom || dateTo) {
      cancelDateMatch.cancelledAt = {};
      if (dateFrom) cancelDateMatch.cancelledAt.$gte = new Date(dateFrom);
      if (dateTo) cancelDateMatch.cancelledAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    } else {
      cancelDateMatch.cancelledAt = { $gte: defaultFrom };
    }

    // Hoy a las 00:00
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [completedSessions, cancelledSessions, inProgressCount, todayCompleted, todayCancelled, todayInProgress, todayCompletedSessions] = await Promise.all([
      // Completados en el período (para stats globales y por picker en JS)
      em.find(PickingSession, { status: 'completed', ...dateMatch }),

      // Cancelados en el período (usan cancelledAt)
      em.find(PickingSession, { status: 'cancelled', ...cancelDateMatch }),

      // Sesiones en progreso (global, sin filtro de fecha)
      em.count(PickingSession, { status: 'in_progress' }),

      // Stats de hoy
      em.count(PickingSession, { status: 'completed', completedAt: { $gte: todayStart } }),
      em.count(PickingSession, { status: 'cancelled', cancelledAt: { $gte: todayStart } }),
      em.count(PickingSession, { status: 'in_progress', startedAt: { $gte: todayStart } }),
      em.find(PickingSession, { status: 'completed', completedAt: { $gte: todayStart } }),
    ]);

    // 1. Stats globales (completados en el período)
    const gs = completedSessions.length > 0
      ? completedSessions.reduce(
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
          { count: 0, totalDuration: 0, totalItemsPicked: 0, totalItemsRequired: 0, minDuration: null as number | null, maxDuration: null as number | null }
        )
      : { count: 0, totalDuration: 0, totalItemsPicked: 0, totalItemsRequired: 0, minDuration: 0, maxDuration: 0 };
    const avgDuration = gs.count > 0 ? gs.totalDuration / gs.count : 0;

    // 2. Stats por picker (completados en el período) agrupado por userId+userName
    interface PickerAgg {
      userId: string;
      userName: string;
      completedOrders: number;
      totalItemsPicked: number;
      totalItemsRequired: number;
      totalDuration: number;
      durationCount: number;
      minDuration: number | null;
      maxDuration: number | null;
      firstPick: Date | null;
      lastPick: Date | null;
    }
    const pickerMap = new Map<string, PickerAgg>();
    for (const s of completedSessions) {
      const userId = s.user.id;
      const key = `${userId}|${s.userName}`;
      let agg = pickerMap.get(key);
      if (!agg) {
        agg = {
          userId,
          userName: s.userName,
          completedOrders: 0,
          totalItemsPicked: 0,
          totalItemsRequired: 0,
          totalDuration: 0,
          durationCount: 0,
          minDuration: null,
          maxDuration: null,
          firstPick: null,
          lastPick: null,
        };
        pickerMap.set(key, agg);
      }
      const d = s.durationSeconds ?? 0;
      agg.completedOrders += 1;
      agg.totalItemsPicked += s.totalPicked;
      agg.totalItemsRequired += s.totalRequired;
      agg.totalDuration += d;
      agg.durationCount += 1;
      agg.minDuration = agg.minDuration === null ? d : Math.min(agg.minDuration, d);
      agg.maxDuration = agg.maxDuration === null ? d : Math.max(agg.maxDuration, d);
      const completedAt = s.completedAt ?? null;
      if (completedAt) {
        if (agg.firstPick === null || completedAt < agg.firstPick) agg.firstPick = completedAt;
        if (agg.lastPick === null || completedAt > agg.lastPick) agg.lastPick = completedAt;
      }
    }
    // Ordenar por totalItemsPicked desc
    const pickerStats = Array.from(pickerMap.values()).sort((a, b) => b.totalItemsPicked - a.totalItemsPicked);

    // 3. Stats de cancelaciones en el período agrupado por userId+userName
    interface CancelAgg { userId: string; userName: string; cancelledCount: number; }
    const cancelAggMap = new Map<string, CancelAgg>();
    for (const s of cancelledSessions) {
      const userId = s.user.id;
      const key = `${userId}|${s.userName}`;
      const existing = cancelAggMap.get(key);
      if (existing) {
        existing.cancelledCount += 1;
      } else {
        cancelAggMap.set(key, { userId, userName: s.userName, cancelledCount: 1 });
      }
    }
    const cancelStats = Array.from(cancelAggMap.values());

    const totalCancelled = cancelStats.reduce(
      (acc: number, c) => acc + c.cancelledCount, 0
    );

    // Mapear cancelaciones por picker (por userName, igual que el comportamiento original)
    const cancelMap = new Map<string, number>();
    for (const c of cancelStats) {
      cancelMap.set(c.userName, c.cancelledCount);
    }

    // Procesar per-picker
    const perPicker = pickerStats.map((p) => {
      const cancelled = cancelMap.get(p.userName) || 0;
      const totalOrders = p.completedOrders + cancelled;
      const pAvgDuration = p.durationCount > 0 ? p.totalDuration / p.durationCount : 0;
      return {
        userId: p.userId,
        userName: p.userName,
        completedOrders: p.completedOrders,
        cancelledOrders: cancelled,
        totalOrders,
        cancelRate: totalOrders > 0 ? Math.round((cancelled / totalOrders) * 1000) / 10 : 0,
        totalItemsPicked: p.totalItemsPicked,
        accuracy: p.totalItemsRequired > 0
          ? Math.round((p.totalItemsPicked / p.totalItemsRequired) * 1000) / 10
          : 100,
        avgDurationSeconds: Math.round(pAvgDuration),
        avgSecondsPerItem: p.totalItemsPicked > 0 ? Math.round(p.totalDuration / p.totalItemsPicked) : 0,
        firstPickAt: p.firstPick,
        lastPickAt: p.lastPick,
      };
    });

    // Agregar pickers que solo tienen cancelaciones
    for (const c of cancelStats) {
      const exists = perPicker.find((p) => p.userName === c.userName);
      if (!exists) {
        perPicker.push({
          userId: c.userId,
          userName: c.userName,
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

    // Items pickeados hoy
    const todayItemsTotal = todayCompletedSessions.reduce((acc, s) => acc + s.totalPicked, 0);

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
        avgDurationSeconds: Math.round(avgDuration || 0),
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
        itemsPicked: todayItemsTotal || 0,
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
