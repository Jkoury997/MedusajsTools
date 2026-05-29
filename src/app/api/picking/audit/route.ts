import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { AuditLog } from '@/lib/entities';

// GET /api/picking/audit - Obtener log de auditoria
export async function GET(req: NextRequest) {
  try {
    const em = await getEm();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');
    const action = searchParams.get('action');
    const userName = searchParams.get('userName');
    const orderId = searchParams.get('orderId');
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};

    if (action) query.action = action;
    if (userName) query.userName = { $ilike: `%${userName}%` };
    if (orderId) query.orderId = orderId;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const [logs, total] = await Promise.all([
      em.find(AuditLog, query, {
        orderBy: { createdAt: 'DESC' },
        offset,
        limit,
        populate: ['user'],
      }),
      em.count(AuditLog, query),
    ]);

    return NextResponse.json({
      success: true,
      logs: logs.map(l => ({
        _id: l.id,
        action: l.action,
        userName: l.userName,
        userId: l.user?.id,
        orderId: l.orderId,
        orderDisplayId: l.orderDisplayId,
        details: l.details,
        metadata: l.metadata,
        createdAt: l.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener auditoria' },
      { status: 500 }
    );
  }
}
