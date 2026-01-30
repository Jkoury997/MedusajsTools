import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, hashPin } from '@/lib/mongodb/models';

// GET /api/picking/users - Listar usuarios
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const includeInactive = req.nextUrl.searchParams.get('all') === 'true';

    const filter = includeInactive ? {} : { active: true };
    const users = await PickingUser.find(filter)
      .select('-pin')
      .sort({ name: 1 });

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('[API users GET]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/picking/users - Crear usuario
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { name, pin } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'El PIN debe ser de 4 dígitos' },
        { status: 400 }
      );
    }

    // Verificar que el PIN no exista
    const existing = await PickingUser.findOne({ pin: hashPin(pin) });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Este PIN ya está en uso' },
        { status: 400 }
      );
    }

    const user = await PickingUser.create({
      name: name.trim(),
      pin: hashPin(pin),
      active: true,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        active: user.active,
        createdAt: user.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[API users POST]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error al crear usuario' },
      { status: 500 }
    );
  }
}
