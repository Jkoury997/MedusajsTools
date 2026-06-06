import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin, pinLookupHashes, isLegacyStored, encryptPin } from '@/lib/pin';
import { createSessionToken, SESSION_DURATION } from '@/lib/auth';
import { getClientIp, isRateLimited, registerFailedAttempt, clearRateLimit } from '@/lib/rate-limit';

const ADMIN_PIN = process.env.ADMIN_PIN;

if (!ADMIN_PIN) {
  console.warn('[Security] ADMIN_PIN no configurado en .env. Login admin deshabilitado.');
}

// POST /api/picking/login - Login con PIN
export async function POST(req: NextRequest) {
  try {
    // Rate limiting anti brute-force: bloquea por IP tras varios intentos
    // FALLIDOS (los logins exitosos no cuentan; ver rate-limit.ts).
    const ip = getClientIp(req);
    const rlKey = `login:${ip}`;
    const limited = isRateLimited(rlKey);
    if (limited.blocked) {
      return NextResponse.json(
        { success: false, error: `Demasiados intentos. Reintenta en ${Math.ceil((limited.retryAfterSeconds || 0) / 60)} minutos.` },
        { status: 429 }
      );
    }

    const em = await getEm();
    const { pin } = await req.json();

    // Detectar si es HTTPS para cookie secure
    const isSecure = req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https');

    if (!pin || pin.length < 4) {
      return NextResponse.json(
        { success: false, error: 'PIN requerido (4-6 dígitos)' },
        { status: 400 }
      );
    }

    // Verificar si es admin
    if (ADMIN_PIN && pin === ADMIN_PIN) {
      const token = createSessionToken('admin', 'admin');
      const response = NextResponse.json({ success: true, user: { name: 'Admin', role: 'admin' } });
      response.cookies.set('picking-session', token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: SESSION_DURATION / 1000,
        path: '/',
      });
      clearRateLimit(rlKey);
      audit({ action: 'login', userName: 'Admin', details: 'Login como admin' });
      return response;
    }

    // Verificar si es picker o encargado de eCommerce (lookup determinístico:
    // HMAC nuevo o sha256 legacy). El rol 'store' entra por /store-auth, no acá.
    const user = await em.findOne(User, {
      pin: { $in: pinLookupHashes(pin) },
      role: { $in: ['picker', 'ecommerce'] },
      active: true,
    });
    if (user) {
      // Migración lazy: re-hashear legacy a HMAC y guardar el PIN cifrado
      // (para que el admin pueda verlo) si todavía no lo tiene.
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
      const token = createSessionToken(user.id, user.role);
      const response = NextResponse.json({
        success: true,
        user: { id: user.id, name: user.name, role: user.role },
        requirePinChange: pin.length < 6,
      });
      response.cookies.set('picking-session', token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: SESSION_DURATION / 1000,
        path: '/',
      });
      clearRateLimit(rlKey);
      audit({ action: 'login', userName: user.name, userId: user.id, details: `Login como ${user.role}` });
      return response;
    }

    registerFailedAttempt(rlKey);
    return NextResponse.json(
      { success: false, error: 'PIN incorrecto' },
      { status: 401 }
    );
  } catch (error) {
    console.error('[login] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}

// DELETE /api/picking/login - Logout
export async function DELETE(req: NextRequest) {
  const isSecure = req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https');
  const response = NextResponse.json({ success: true });
  response.cookies.set('picking-session', '', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
