import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { AuditLog, StoreDelivery, PickingUser } from '@/lib/mongodb/models';

// GET /api/stats/activity - Actividad (auditoría + entregas + usuarios)
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
      auditByAction,
      recentActions,
      deliveriesByStore,
      recentDeliveries,
      totalDeliveries,
      activePickers,
      activeStoreUsers,
    ] = await Promise.all([
      // 1. Audit: conteo por tipo de acción
      AuditLog.aggregate([
        { $match: { ...dateMatch } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // 2. Audit: últimas 20 acciones
      AuditLog.find(dateMatch)
        .sort({ createdAt: -1 })
        .limit(20)
        .select('action userName orderId orderDisplayId details createdAt')
        .lean(),

      // 3. Entregas agrupadas por tienda
      StoreDelivery.aggregate([
        { $match: { ...deliveryDateMatch } },
        {
          $group: {
            _id: { storeId: '$storeId', storeName: '$storeName' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // 4. Últimas 10 entregas
      StoreDelivery.find(deliveryDateMatch)
        .sort({ deliveredAt: -1 })
        .limit(10)
        .select('orderId orderDisplayId storeName deliveredByName deliveredAt')
        .lean(),

      // 5. Total entregas en período
      StoreDelivery.countDocuments(deliveryDateMatch),

      // 6-7. Usuarios activos
      PickingUser.countDocuments({ active: true, role: 'picker' }),
      PickingUser.countDocuments({ active: true, role: 'store' }),
    ]);

    // Procesar audit por acción
    const byActionType: Record<string, number> = {};
    let totalActions = 0;
    for (const a of auditByAction) {
      byActionType[a._id] = a.count;
      totalActions += a.count;
    }

    // Procesar entregas por tienda
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byStore = deliveriesByStore.map((d: any) => ({
      storeId: d._id.storeId,
      storeName: d._id.storeName,
      count: d.count,
    }));

    const periodFrom = dateFrom || defaultFrom.toISOString().split('T')[0];
    const periodTo = dateTo || now.toISOString().split('T')[0];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      period: { from: periodFrom, to: periodTo },
      audit: {
        totalActions,
        byActionType,
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
