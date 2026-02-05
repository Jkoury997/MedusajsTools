import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, audit, hashPin } from '@/lib/mongodb/models';
import { createHmac } from 'crypto';

const ADMIN_PIN = process.env.ADMIN_PIN || '9999';
const SESSION_SECRET = process.env.SESSION_SECRET || 'pickup-secret-2024';
const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 horas

function createSessionToken(userId: string, role: string): string {
  const expires = Date.now() + SESSION_DURATION;
  const data = `${userId}:${role}:${expires}`;
  // HMAC-SHA256 — compatible con Web Crypto API en middleware
  const signature = createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

// POST /api/picking/login - Login con PIN
export async function POST(req: NextRequest) {
  try {
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
    if (pin === ADMIN_PIN) {
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
