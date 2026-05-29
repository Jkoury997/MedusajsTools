import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin } from '@/lib/pin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const ADMIN_PIN = process.env.ADMIN_PIN;

// POST /api/picking/auth - Validar PIN
export async function POST(req: NextRequest) {
  try {
    // Rate limiting: 5 intentos por IP cada 15 minutos
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`auth:${ip}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: `Demasiados intentos. Reintenta en ${Math.ceil((rateCheck.retryAfterSeconds || 0) / 60)} minutos.` },
        { status: 429 }
      );
    }

    const em = await getEm();
    const { pin } = await req.json();

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN inválido' },
        { status: 400 }
      );
    }

    // Admin puede hacer picking también
    if (ADMIN_PIN && pin === ADMIN_PIN) {
      return NextResponse.json({
        success: true,
        user: {
          id: 'admin',
          name: 'Admin',
        },
        requirePinChange: false,
      });
    }

    const user = await em.findOne(User, {
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
        id: user.id,
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
    const em = await getEm();
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
    const user = await em.findOne(User, {
      id: userId,
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
    const existing = await em.findOne(User, {
      pin: hashPin(newPin),
      id: { $ne: userId },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Este PIN ya está en uso por otro usuario' },
        { status: 400 }
      );
    }

    // Actualizar PIN
    user.pin = hashPin(newPin);
    await em.flush();

    audit({
      action: 'user_update',
      userName: user.name,
      userId: user.id,
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
