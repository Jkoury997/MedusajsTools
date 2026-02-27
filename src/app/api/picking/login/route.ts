import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, audit, hashPin } from '@/lib/mongodb/models';
import { createSessionToken, SESSION_DURATION } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const ADMIN_PIN = process.env.ADMIN_PIN;

if (!ADMIN_PIN) {
  console.warn('[Security] ADMIN_PIN no configurado en .env. Login admin deshabilitado.');
}

// POST /api/picking/login - Login con PIN
export async function POST(req: NextRequest) {
  try {
    // Rate limiting: 5 intentos por IP cada 15 minutos
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: `Demasiados intentos. Reintenta en ${Math.ceil((rateCheck.retryAfterSeconds || 0) / 60)} minutos.` },
        { status: 429 }
      );
    }

    await connectDB();
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
      audit({ action: 'login', userName: 'Admin', details: 'Login como admin' });
      return response;
    }

    // Verificar si es picker
    const user = await PickingUser.findOne({ pin: hashPin(pin), role: 'picker', active: true });
    if (user) {
      const token = createSessionToken(user._id.toString(), 'picker');
      const response = NextResponse.json({
        success: true,
        user: { id: user._id, name: user.name, role: 'picker' },
        requirePinChange: pin.length < 6,
      });
      response.cookies.set('picking-session', token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: SESSION_DURATION / 1000,
        path: '/',
      });
      audit({ action: 'login', userName: user.name, userId: user._id.toString(), details: 'Login como picker' });
      return response;
    }

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
