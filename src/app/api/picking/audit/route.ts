import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { AuditLog } from '@/lib/mongodb/models';

// GET /api/picking/audit - Obtener log de auditoria
export async function GET(req: NextRequest) {
  try {
    await connectDB();

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
    if (userName) query.userName = { $regex: userName, $options: 'i' };
    if (orderId) query.orderId = orderId;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      logs: logs.map(l => ({
        _id: l._id,
        action: l.action,
        userName: l.userName,
        userId: l.userId,
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
