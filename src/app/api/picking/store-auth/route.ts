import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User, Store } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin, pinLookupHashes, isLegacyStored } from '@/lib/pin';
import { createSessionToken, SESSION_DURATION } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const ADMIN_PIN = process.env.ADMIN_PIN;

/** Cookie httpOnly de sesión (mismo patrón que picking/login). */
function setSessionCookie(res: NextResponse, token: string, req: NextRequest) {
  const isSecure = req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https');
  res.cookies.set('picking-session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  });
}

// POST /api/picking/store-auth - Login de usuario tienda
export async function POST(req: NextRequest) {
  try {
    // Rate limiting: 5 intentos por IP cada 15 minutos
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`store-auth:${ip}`, 5, 15 * 60 * 1000);
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
        { success: false, error: 'PIN de 4 a 6 dígitos requerido' },
        { status: 400 }
      );
    }

    // Admin puede entrar a tienda — tomar la primera tienda disponible
    if (ADMIN_PIN && pin === ADMIN_PIN) {
      const firstStore = await em.findOne(Store, { name: { $ne: '' } });
      const token = createSessionToken('admin', 'store');
      const res = NextResponse.json({
        success: true,
        user: {
          id: 'admin',
          name: 'Admin',
          role: 'admin',
          storeId: firstStore?.externalId || 'admin',
          storeName: firstStore?.name || 'Admin',
        },
        requirePinChange: false,
      });
      setSessionCookie(res, token, req);
      return res;
    }

    const user = await em.findOne(User, {
      pin: { $in: pinLookupHashes(pin) },
      role: 'store',
      active: true,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto o usuario no es tienda' },
        { status: 401 }
      );
    }

    // Migración lazy del hash legacy.
    if (isLegacyStored(user.pin, pin)) {
      user.pin = hashPin(pin);
      await em.flush();
    }

    audit({
      action: 'store_login',
      userName: user.name,
      userId: user.id,
      details: `Login tienda: ${user.storeName} (${user.name})`,
    });

    const requirePinChange = pin.length < 6;
    const token = createSessionToken(user.id, 'store');

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        storeName: user.storeName,
      },
      requirePinChange,
    });
    setSessionCookie(res, token, req);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}
