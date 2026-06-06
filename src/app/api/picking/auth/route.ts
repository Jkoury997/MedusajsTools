import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin, pinLookupHashes, isLegacyStored, encryptPin } from '@/lib/pin';
import { errorResponse } from '@/lib/http';
import { getClientIp, isRateLimited, registerFailedAttempt, clearRateLimit } from '@/lib/rate-limit';

const ADMIN_PIN = process.env.ADMIN_PIN;

// POST /api/picking/auth - Validar PIN
export async function POST(req: NextRequest) {
  try {
    // Rate limiting anti brute-force: bloquea por IP tras varios intentos
    // FALLIDOS (los logins exitosos no cuentan; ver rate-limit.ts).
    const ip = getClientIp(req);
    const rlKey = `auth:${ip}`;
    const limited = isRateLimited(rlKey);
    if (limited.blocked) {
      return NextResponse.json(
        { success: false, error: `Demasiados intentos. Reintenta en ${Math.ceil((limited.retryAfterSeconds || 0) / 60)} minutos.` },
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
      clearRateLimit(rlKey);
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
      pin: { $in: pinLookupHashes(pin) },
      role: { $in: ['picker', 'ecommerce'] },
      active: true,
    });

    if (!user) {
      registerFailedAttempt(rlKey);
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto o sin permiso de picking' },
        { status: 401 }
      );
    }

    clearRateLimit(rlKey);

    // Migración perezosa: re-hashear PIN legacy a HMAC + cifrar para verlo en admin
    let needFlush = false;
    if (isLegacyStored(user.pin, pin)) {
      user.pin = hashPin(pin);
      needFlush = true;
    }
    if (!user.pinEnc) {
      user.pinEnc = encryptPin(pin);
      needFlush = true;
    }
    if (needFlush) await em.flush();

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
    return errorResponse(error);
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
      pin: { $in: pinLookupHashes(currentPin) },
      active: true,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN actual incorrecto' },
        { status: 401 }
      );
    }

    // Migración perezosa del PIN actual (verificación de PIN existente)
    if (isLegacyStored(user.pin, currentPin)) {
      user.pin = hashPin(currentPin);
      await em.flush();
    }

    // Verificar que el nuevo PIN no esté en uso
    const existing = await em.findOne(User, {
      pin: { $in: pinLookupHashes(newPin) },
      id: { $ne: userId },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Este PIN ya está en uso por otro usuario' },
        { status: 400 }
      );
    }

    // Actualizar PIN (hash de login + cifrado para verlo en admin)
    user.pin = hashPin(newPin);
    user.pinEnc = encryptPin(newPin);
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
    return errorResponse(error);
  }
}
