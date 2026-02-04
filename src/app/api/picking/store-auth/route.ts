import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { PickingUser, Store, hashPin, audit } from '@/lib/mongodb/models';

const ADMIN_PIN = process.env.ADMIN_PIN || '9999';

// POST /api/picking/store-auth - Login de usuario tienda
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { pin } = await req.json();

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN de 4 a 6 dígitos requerido' },
        { status: 400 }
      );
    }

    // Admin puede entrar a tienda — tomar la primera tienda disponible
    if (pin === ADMIN_PIN) {
      const firstStore = await Store.findOne({ name: { $exists: true, $ne: '' } });
      return NextResponse.json({
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
    }

    const user = await PickingUser.findOne({
      pin: hashPin(pin),
      role: 'store',
      active: true,
    }).select('-pin');

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto o usuario no es tienda' },
        { status: 401 }
      );
    }

    audit({
      action: 'store_login',
      userName: user.name,
      userId: user._id.toString(),
      details: `Login tienda: ${user.storeName} (${user.name})`,
    });

    const requirePinChange = pin.length < 6;

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        storeName: user.storeName,
      },
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
