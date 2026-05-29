import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { AuditLog, StoreDelivery, User } from '@/lib/entities';

// GET /api/stats/activity - Actividad (auditoría + entregas + usuarios)
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
      dateMatch.createdAt = {};
      if (dateFrom) dateMatch.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateMatch.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    } else {
      dateMatch.createdAt = { $gte: defaultFrom };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deliveryDateMatch: Record<string, any> = {};
    if (dateFrom || dateTo) {
      deliveryDateMatch.deliveredAt = {};
      if (dateFrom) deliveryDateMatch.deliveredAt.$gte = new Date(dateFrom);
      if (dateTo) deliveryDateMatch.deliveredAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    } else {
      deliveryDateMatch.deliveredAt = { $gte: defaultFrom };
    }

    const [
      auditLogs,
      recentActionLogs,
      deliveries,
      recentDeliveryDocs,
      totalDeliveries,
      activePickers,
      activeStoreUsers,
    ] = await Promise.all([
      // 1. Audit: todos los logs del período (para conteo por tipo de acción en JS)
      em.find(AuditLog, dateMatch),

      // 2. Audit: últimas 20 acciones
      em.find(AuditLog, dateMatch, { orderBy: { createdAt: 'DESC' }, limit: 20 }),

      // 3. Entregas del período (para agrupar por tienda en JS)
      em.find(StoreDelivery, deliveryDateMatch),

      // 4. Últimas 10 entregas
      em.find(StoreDelivery, deliveryDateMatch, { orderBy: { deliveredAt: 'DESC' }, limit: 10 }),

      // 5. Total entregas en período
      em.count(StoreDelivery, deliveryDateMatch),

      // 6-7. Usuarios activos
      em.count(User, { active: true, role: 'picker' }),
      em.count(User, { active: true, role: 'store' }),
    ]);

    // Proyección equivalente al .select() de Mongo
    const recentActions = recentActionLogs.map(a => ({
      action: a.action,
      userName: a.userName,
      orderId: a.orderId,
      orderDisplayId: a.orderDisplayId,
      details: a.details,
      createdAt: a.createdAt,
    }));
    const recentDeliveries = recentDeliveryDocs.map(d => ({
      orderId: d.orderId,
      orderDisplayId: d.orderDisplayId,
      storeName: d.storeName,
      deliveredByName: d.deliveredByName,
      deliveredAt: d.deliveredAt,
    }));

    // Procesar audit por acción (group by action + count, ordenado desc)
    const byActionType: Record<string, number> = {};
    let totalActions = 0;
    for (const a of auditLogs) {
      byActionType[a.action] = (byActionType[a.action] || 0) + 1;
      totalActions += 1;
    }
    // Reordenar por count desc (equivalente a $sort: { count: -1 })
    const sortedByAction: Record<string, number> = {};
    for (const [action, count] of Object.entries(byActionType).sort((x, y) => y[1] - x[1])) {
      sortedByAction[action] = count;
    }

    // Procesar entregas por tienda (group by storeId+storeName + count, ordenado desc)
    const storeMap = new Map<string, { storeId: string; storeName: string; count: number }>();
    for (const d of deliveries) {
      const k = `${d.storeId}|${d.storeName}`;
      const existing = storeMap.get(k);
      if (existing) {
        existing.count += 1;
      } else {
        storeMap.set(k, { storeId: d.storeId, storeName: d.storeName, count: 1 });
      }
    }
    const byStore = Array.from(storeMap.values()).sort((a, b) => b.count - a.count);

    const periodFrom = dateFrom || defaultFrom.toISOString().split('T')[0];
    const periodTo = dateTo || now.toISOString().split('T')[0];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      period: { from: periodFrom, to: periodTo },
      audit: {
        totalActions,
        byActionType: sortedByAction,
        recentActions,
      },
      deliveries: {
        totalDeliveries,
        byStore,
        recentDeliveries,
      },
      users: {
        totalActive: activePickers + activeStoreUsers,
        pickers: activePickers,
        storeUsers: activeStoreUsers,
      },
    });
  } catch (error) {
    console.error('[Stats Activity] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener stats de actividad' },
      { status: 500 }
    );
  }
}
