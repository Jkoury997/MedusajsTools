import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User, Store } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin } from '@/lib/pin';
import { createSessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const ADMIN_PIN = process.env.ADMIN_PIN;

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
      return NextResponse.json({
        success: true,
        user: {
          id: 'admin',
          name: 'Admin',
          role: 'admin',
          storeId: firstStore?.externalId || 'admin',
          storeName: firstStore?.name || 'Admin',
        },
        token,
        requirePinChange: false,
      });
    }

    const user = await em.findOne(User, {
      pin: hashPin(pin),
      role: 'store',
      active: true,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto o usuario no es tienda' },
        { status: 401 }
      );
    }

    audit({
      action: 'store_login',
      userName: user.name,
      userId: user.id,
      details: `Login tienda: ${user.storeName} (${user.name})`,
    });

    const requirePinChange = pin.length < 6;
    const token = createSessionToken(user.id, 'store');

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        storeName: user.storeName,
      },
      token,
      requirePinChange,
    });
  } catch (error) {
    console.error('[store-auth] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}
