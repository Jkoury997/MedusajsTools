import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User, PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin, pinLookupHashes, encryptPin } from '@/lib/pin';
import { requireRole } from '@/lib/session';
import { errorResponse } from '@/lib/http';

interface RouteParams {
  params: Promise<{ userId: string }>;
}

// GET /api/picking/users/:userId - Usuario con estadísticas
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { userId } = await params;

    // id inválido (p. ej. "undefined") -> 404, no 500 por error de cast de uuid
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const user = await em.findOne(User, { id: userId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Estadísticas
    const sessions = await em.find(PickingSession, { user: user.id });
    const completed = sessions.filter(s => s.status === 'completed');
    const totalDuration = completed.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const totalItems = completed.reduce((sum, s) => sum + s.totalPicked, 0);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        active: user.active,
        createdAt: user.createdAt,
      },
      stats: {
        totalSessions: sessions.length,
        completedSessions: completed.length,
        totalItemsPicked: totalItems,
        avgDurationSeconds: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
      },
      recentSessions: completed.slice(-10).reverse().map(s => ({
        id: s.id,
        orderDisplayId: s.orderDisplayId,
        durationSeconds: s.durationSeconds,
        totalPicked: s.totalPicked,
        completedAt: s.completedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// PUT /api/picking/users/:userId - Actualizar usuario
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await requireRole('admin');
    const em = await getEm();
    const { userId } = await params;
    const { name, pin, active, role, storeId, storeName } = await req.json();

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: 'El nombre es requerido' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (pin !== undefined) {
      if (!/^\d{4,6}$/.test(pin)) {
        return NextResponse.json(
          { success: false, error: 'El PIN debe ser de 4 a 6 dígitos' },
          { status: 400 }
        );
      }
      const existing = await em.findOne(User, { pin: { $in: pinLookupHashes(pin) }, id: { $ne: userId } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Este PIN ya está en uso' },
          { status: 400 }
        );
      }
      updateData.pin = hashPin(pin);
      updateData.pinEnc = encryptPin(pin);
    }

    if (active !== undefined) {
      updateData.active = active;
    }

    if (role !== undefined) {
      updateData.role = ['store', 'ecommerce', 'picker'].includes(role) ? role : 'picker';
    }
    if (storeId !== undefined) updateData.storeId = storeId?.trim() || '';
    if (storeName !== undefined) updateData.storeName = storeName?.trim() || '';

    const user = await em.findOne(User, { id: userId });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    em.assign(user, updateData);
    await em.flush();

    const changes = Object.keys(updateData).filter(k => k !== 'pin').map(k => `${k}=${updateData[k]}`).join(', ');
    const pinChanged = 'pin' in updateData;
    audit({
      action: 'user_update',
      userName: 'Admin',
      details: `Usuario actualizado: ${user.name}${changes ? ` (${changes})` : ''}${pinChanged ? ' (PIN cambiado)' : ''}`,
      metadata: { targetUserId: userId, targetUserName: user.name, changes: Object.keys(updateData) },
    });

    const { pin: _pin, pinEnc: _pinEnc, ...userWithoutPin } = user;
    return NextResponse.json({ success: true, user: userWithoutPin });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/picking/users/:userId - Eliminar usuario
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    await requireRole('admin');
    const em = await getEm();
    const { userId } = await params;

    // Verificar que no tenga sesiones de picking activas
    const activeSessions = await em.findOne(PickingSession, {
      user: userId,
      status: 'in_progress',
    });

    if (activeSessions) {
      return NextResponse.json(
        { success: false, error: 'No se puede eliminar: tiene un picking en curso' },
        { status: 400 }
      );
    }

    const user = await em.findOne(User, { id: userId });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    await em.nativeDelete(User, { id: userId });

    audit({
      action: 'user_delete',
      userName: 'Admin',
      details: `Usuario eliminado: ${user.name}`,
      metadata: { deletedUserId: userId, deletedUserName: user.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
