import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb/connection';
import { Store } from '@/lib/mongodb/models';
import { getPaidOrders } from '@/lib/medusa';

// GET /api/picking/stores - Listar tiendas (MongoDB + sync desde pedidos)
export async function GET() {
  try {
    await connectDB();

    // Limpiar tiendas sin nombre que se hayan colado
    await Store.deleteMany({
      $or: [
        { name: { $exists: false } },
        { name: '' },
        { name: null },
        { externalId: { $exists: false } },
        { externalId: '' },
        { externalId: null },
      ],
    });

    // Sync: extraer tiendas de pedidos y upsert en MongoDB
    try {
      const [preparar, enviar, enviados] = await Promise.all([
        getPaidOrders(200, 0, 'preparar'),
        getPaidOrders(200, 0, 'enviar'),
        getPaidOrders(200, 0, 'enviados'),
      ]);

      const allOrders = [...preparar.orders, ...enviar.orders, ...enviados.orders];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const order of allOrders as any[]) {
        const methods = order.shipping_methods || [];
        for (const m of methods) {
          const store = m.data?.store;
          // Validar que tenga ID y nombre reales (no vacíos)
          if (
            store &&
            typeof store.id === 'string' && store.id.trim() !== '' &&
            typeof store.name === 'string' && store.name.trim() !== ''
          ) {
            await Store.updateOne(
              { externalId: store.id },
              { $setOnInsert: { externalId: store.id, name: store.name.trim(), address: (store.address || '').trim(), active: true } },
              { upsert: true }
            );
          }
        }
      }
    } catch (syncErr) {
      console.error('[stores] Sync error (non-fatal):', syncErr);
    }

    // Devolver solo tiendas activas con nombre real
    const stores = await Store.find({
      active: true,
      name: { $exists: true, $ne: '' },
      externalId: { $exists: true, $ne: '' },
    }).sort({ name: 1 }).lean();

    return NextResponse.json({
      success: true,
      stores: stores.map(s => ({
        id: s.externalId,
        name: s.name,
        address: s.address || '',
        _id: s._id,
      })),
    });
  } catch (error) {
    console.error('[stores] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener tiendas' },
      { status: 500 }
    );
  }
}

// POST /api/picking/stores - Crear tienda manualmente
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { name, address } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    // Generar un ID unico
    const externalId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const store = await Store.create({
      externalId,
      name: name.trim(),
      address: (address || '').trim(),
      active: true,
    });

    return NextResponse.json({
      success: true,
      store: {
        id: store.externalId,
        name: store.name,
        address: store.address,
        _id: store._id,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[stores POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al crear tienda' },
      { status: 500 }
    );
  }
}
