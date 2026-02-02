import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { audit } from '@/lib/mongodb/models';

const ADMIN_PIN = process.env.ADMIN_PIN || '9999';

// POST /api/picking/admin-auth - Validar PIN de admin
export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (!pin) {
      return NextResponse.json(
        { success: false, error: 'PIN requerido' },
        { status: 400 }
      );
    }

    if (pin !== ADMIN_PIN) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrecto' },
        { status: 401 }
      );
    }

    // Registrar login admin
    await connectDB();
    audit({
      action: 'admin_login',
      userName: 'Admin',
      details: 'Acceso al panel de administracion',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    );
  }
}
