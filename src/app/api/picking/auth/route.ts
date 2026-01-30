import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, hashPin } from '@/lib/mongodb/models';

// POST /api/picking/auth - Validar PIN
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { pin } = await req.json();

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN inválido' },
        { status: 400 }
      );
    }

    const user = await PickingUser.findOne({
      pin: hashPin(pin),
      active: true,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto o usuario inactivo' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}
