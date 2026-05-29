import { NextRequest, NextResponse } from 'next/server';
import { getEm } from '@/lib/db';
import { Store } from '@/lib/entities';
import { getPaidOrders } from '@/lib/medusa';

// GET /api/picking/stores - Listar tiendas (Postgres + sync desde pedidos)
export async function GET() {
  try {
    const em = await getEm();

    // Limpiar tiendas sin nombre que se hayan colado
    await em.nativeDelete(Store, {
      $or: [
        { name: '' },
        { name: null },
        { externalId: '' },
        { externalId: null },
      ],
    });

    // Sync: extraer tiendas de pedidos y upsert en Postgres
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
            const existing = await em.findOne(Store, { externalId: store.id });
            if (!existing) {
              const newStore = em.create(Store, {
                externalId: store.id,
                name: store.name.trim(),
                address: (store.address || '').trim(),
                active: true,
              });
              await em.persistAndFlush(newStore);
            }
          }
        }
      }
    } catch (syncErr) {
      console.error('[stores] Sync error (non-fatal):', syncErr);
    }

    // Devolver solo tiendas activas con nombre real
    const stores = await em.find(Store, {
      active: true,
      name: { $ne: '' },
      externalId: { $ne: '' },
    }, { orderBy: { name: 'ASC' } });

    return NextResponse.json({
      success: true,
      stores: stores.map(s => ({
        id: s.externalId,
        name: s.name,
        address: s.address || '',
        _id: s.id,
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
    const em = await getEm();
    const { name, address } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    // Generar un ID unico
    const externalId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const store = em.create(Store, {
      externalId,
      name: name.trim(),
      address: (address || '').trim(),
      active: true,
    });
    await em.persistAndFlush(store);

    return NextResponse.json({
      success: true,
      store: {
        id: store.externalId,
        name: store.name,
        address: store.address,
        _id: store.id,
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
