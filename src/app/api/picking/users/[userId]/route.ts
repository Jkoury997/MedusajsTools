import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, PickingSession, hashPin } from '@/lib/mongodb/models';

interface RouteParams {
  params: Promise<{ userId: string }>;
}

// GET /api/picking/users/:userId - Usuario con estadísticas
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { userId } = await params;

    const user = await PickingUser.findById(userId).select('-pin');
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Estadísticas
    const sessions = await PickingSession.find({ userId: user._id });
    const completed = sessions.filter(s => s.status === 'completed');
    const totalDuration = completed.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const totalItems = completed.reduce((sum, s) => sum + s.totalPicked, 0);

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
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
        id: s._id,
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
    await connectDB();
    const { userId } = await params;
    const { name, pin, active } = await req.json();

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
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { success: false, error: 'El PIN debe ser de 4 dígitos' },
          { status: 400 }
        );
      }
      const existing = await PickingUser.findOne({ pin: hashPin(pin), _id: { $ne: userId } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Este PIN ya está en uso' },
          { status: 400 }
        );
      }
      updateData.pin = hashPin(pin);
    }

    if (active !== undefined) {
      updateData.active = active;
    }

    const user = await PickingUser.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-pin');

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al actualizar' },
      { status: 500 }
    );
  }
}

// DELETE /api/picking/users/:userId - Eliminar usuario
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { userId } = await params;

    // Verificar que no tenga sesiones de picking activas
    const activeSessions = await PickingSession.findOne({
      userId,
      status: 'in_progress',
    });

    if (activeSessions) {
      return NextResponse.json(
        { success: false, error: 'No se puede eliminar: tiene un picking en curso' },
        { status: 400 }
      );
    }

    const user = await PickingUser.findByIdAndDelete(userId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al eliminar usuario' },
      { status: 500 }
    );
  }
}
