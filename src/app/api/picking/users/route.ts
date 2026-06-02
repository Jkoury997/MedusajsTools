import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { User } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { hashPin, pinLookupHashes, encryptPin, decryptPin } from '@/lib/pin';
import { requireRole, getSession } from '@/lib/session';
import { errorResponse } from '@/lib/http';

// GET /api/picking/users - Listar usuarios
export async function GET(req: NextRequest) {
  try {
    const em = await getEm();
    const includeInactive = req.nextUrl.searchParams.get('all') === 'true';

    // El PIN descifrado SOLO se devuelve a un admin logueado (nunca a la stats key).
    const session = await getSession();
    const isAdmin = session?.role === 'admin';

    const filter = includeInactive ? {} : { active: true };
    const found = await em.find(User, filter, { orderBy: { name: 'ASC' } });
    const users = found.map(({ pin: _pin, pinEnc, ...rest }) => ({
      ...rest,
      // null = usuario migrado sin PIN visible aún (se revela cuando hace login o lo reseteás)
      pin: isAdmin ? decryptPin(pinEnc) : undefined,
    }));

    return NextResponse.json({ success: true, users });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/picking/users - Crear usuario
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const em = await getEm();
    const { name, pin, role, storeId, storeName } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'El PIN debe ser de 4 a 6 dígitos' },
        { status: 400 }
      );
    }

    // Verificar que el PIN no exista
    const existing = await em.findOne(User, { pin: { $in: pinLookupHashes(pin) } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Este PIN ya está en uso' },
        { status: 400 }
      );
    }

    // Validar datos de tienda si el rol es store
    const userRole = ['store', 'ecommerce', 'picker'].includes(role) ? role : 'picker';
    if (userRole === 'store' && (!storeId?.trim() || !storeName?.trim())) {
      return NextResponse.json(
        { success: false, error: 'Para usuarios tienda se requiere ID y nombre de tienda' },
        { status: 400 }
      );
    }

    const user = em.create(User, {
      name: name.trim(),
      pin: hashPin(pin),
      pinEnc: encryptPin(pin),
      active: true,
      role: userRole,
      ...(userRole === 'store' ? { storeId: storeId.trim(), storeName: storeName.trim() } : {}),
    });
    await em.persistAndFlush(user);

    audit({
      action: 'user_create',
      userName: 'Admin',
      details: `Usuario creado: ${user.name} (${userRole}${userRole === 'store' ? ` - ${storeName}` : ''})`,
      metadata: { newUserId: user.id, newUserName: user.name, role: userRole, storeName: storeName || undefined },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        active: user.active,
        createdAt: user.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
