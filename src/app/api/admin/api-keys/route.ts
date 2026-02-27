import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { ApiKey, audit } from '@/lib/mongodb/models';
import { generateApiKey } from '@/lib/auth';

// GET /api/admin/api-keys - Listar API keys (parcialmente enmascaradas)
export async function GET() {
  try {
    await connectDB();
    const keys = await ApiKey.find().sort({ createdAt: -1 }).lean();

    const masked = keys.map(k => ({
      id: k._id,
      name: k.name,
      // Mostrar solo los primeros 7 y últimos 4 caracteres
      key: k.key.slice(0, 7) + '...' + k.key.slice(-4),
      active: k.active,
      lastUsedAt: k.lastUsedAt,
      createdByName: k.createdByName,
      createdAt: k.createdAt,
    }));

    return NextResponse.json({ success: true, apiKeys: masked });
  } catch (error) {
    console.error('[api-keys] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al listar API keys' },
      { status: 500 }
    );
  }
}

// POST /api/admin/api-keys - Crear nueva API key
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { name } = await req.json();

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Nombre requerido (min 2 caracteres)' },
        { status: 400 }
      );
    }

    const key = generateApiKey();

    const apiKey = await ApiKey.create({
      key,
      name: name.trim(),
      active: true,
      createdByName: 'Admin',
    });

    audit({
      action: 'api_key_create',
      userName: 'Admin',
      details: `API key creada: ${name.trim()}`,
      metadata: { keyPrefix: key.slice(0, 7) },
    });

    // Retornar la key completa SOLO en la creación (después se enmascara)
    return NextResponse.json({
      success: true,
      apiKey: {
        id: apiKey._id,
        name: apiKey.name,
        key, // Key completa - mostrar una sola vez
        active: apiKey.active,
        createdAt: apiKey.createdAt,
      },
      message: 'Guarda esta API key, no se mostrara completa de nuevo.',
    });
  } catch (error) {
    console.error('[api-keys] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al crear API key' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/api-keys - Revocar API key
export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID requerido' },
        { status: 400 }
      );
    }

    const apiKey = await ApiKey.findById(id);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key no encontrada' },
        { status: 404 }
      );
    }

    apiKey.active = false;
    await apiKey.save();

    audit({
      action: 'api_key_revoke',
      userName: 'Admin',
      details: `API key revocada: ${apiKey.name}`,
      metadata: { keyPrefix: apiKey.key.slice(0, 7) },
    });

    return NextResponse.json({
      success: true,
      message: `API key "${apiKey.name}" revocada`,
    });
  } catch (error) {
    console.error('[api-keys] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al revocar API key' },
      { status: 500 }
    );
  }
}
