import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, hashPin, audit } from '@/lib/mongodb/models';

const ADMIN_PIN = process.env.ADMIN_PIN || '9999';

// POST /api/picking/auth - Validar PIN
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { pin } = await req.json();

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN inválido' },
        { status: 400 }
      );
    }

    // Admin puede hacer picking también
    if (pin === ADMIN_PIN) {
      return NextResponse.json({
        success: true,
        user: {
          id: 'admin',
          name: 'Admin',
        },
        requirePinChange: false,
      });
    }

    const user = await PickingUser.findOne({
      pin: hashPin(pin),
      role: 'picker',
      active: true,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto o no sos picker' },
        { status: 401 }
      );
    }

    // Indicar si necesita cambiar a 6 dígitos
    const requirePinChange = pin.length < 6;

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
      },
      requirePinChange,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// PUT /api/picking/auth - Cambiar PIN
export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const { userId, currentPin, newPin } = await req.json();

    if (!userId || !currentPin || !newPin) {
      return NextResponse.json(
        { success: false, error: 'Datos incompletos' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { success: false, error: 'El nuevo PIN debe ser de 6 dígitos' },
        { status: 400 }
      );
    }

    // Verificar que el usuario existe y el PIN actual es correcto
    const user = await PickingUser.findOne({
      _id: userId,
      pin: hashPin(currentPin),
      active: true,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN actual incorrecto' },
        { status: 401 }
      );
    }

    // Verificar que el nuevo PIN no esté en uso
    const existing = await PickingUser.findOne({
      pin: hashPin(newPin),
      _id: { $ne: userId },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Este PIN ya está en uso por otro usuario' },
        { status: 400 }
      );
    }

    // Actualizar PIN
    user.pin = hashPin(newPin);
    await user.save();

    audit({
      action: 'user_update',
      userName: user.name,
      userId: user._id.toString(),
      details: `PIN actualizado a 6 dígitos por el usuario`,
    });

    return NextResponse.json({
      success: true,
      message: 'PIN actualizado correctamente',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}
