import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { PickingSession } from '@/lib/entities';
import { audit } from '@/lib/audit';
import { errorResponse } from '@/lib/http';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// POST /api/picking/session/:orderId/pick - Pickear item (+1)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const em = await getEm();
    const { orderId } = await params;
    const { lineItemId, barcode, method } = await req.json();

    const result = await em.transactional(async (tem) => {
      const session = await tem.findOne(PickingSession, {
        orderId,
        status: 'in_progress',
      }, { populate: ['items', 'user'], lockMode: LockMode.PESSIMISTIC_WRITE });

      if (!session) {
        return { error: 'not_found' as const };
      }

      const items = session.items.getItems();

      // Buscar el item
      let item;
      if (method === 'barcode' && barcode) {
        item = items.find(i => i.barcode === barcode);
      } else if (lineItemId) {
        item = items.find(i => i.lineItemId === lineItemId);
      }

      if (!item) {
        if (method === 'barcode') {
          // Build a helpful error message showing which barcodes exist
          const availableBarcodes = items
            .filter(i => i.barcode && i.quantityPicked < i.quantityRequired)
            .map(i => i.barcode);
          const errorMsg = availableBarcodes.length > 0
            ? `Código "${barcode}" no encontrado. Códigos válidos: ${availableBarcodes.join(', ')}`
            : 'Código de barras no encontrado en este pedido';
          return { error: 'bad_request' as const, message: errorMsg };
        }
        return { error: 'bad_request' as const, message: 'Item no encontrado' };
      }

      // Verificar que no exceda
      if (item.quantityPicked >= item.quantityRequired) {
        return { error: 'bad_request' as const, message: `Ya se pickearon todos (${item.quantityPicked}/${item.quantityRequired})` };
      }

      // Incrementar
      item.quantityPicked += 1;
      item.pickedAt = new Date();
      item.scanMethod = method || 'manual';

      session.totalPicked = items.reduce((sum, i) => sum + i.quantityPicked, 0);

      // Si se pickea un item que tenía faltantes, resetear faltante
      if (item.quantityMissing && item.quantityPicked + (item.quantityMissing || 0) > item.quantityRequired) {
        item.quantityMissing = Math.max(0, item.quantityRequired - item.quantityPicked);
        session.totalMissing = items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
      }

      await tem.flush();

      const totalRequired = items.reduce((sum, i) => sum + i.quantityRequired, 0);
      const totalPicked = session.totalPicked;
      const totalMissing = items.reduce((sum, i) => sum + (i.quantityMissing || 0), 0);
      const isComplete = items.every(i => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired);
      const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

      audit({
        action: 'item_pick',
        userName: session.userName,
        userId: session.user?.id,
        orderId,
        orderDisplayId: session.orderDisplayId,
        details: `Pick item ${item.barcode || item.sku || item.lineItemId} (${item.quantityPicked}/${item.quantityRequired}) via ${method || 'manual'}`,
        metadata: { lineItemId: item.lineItemId, sku: item.sku, barcode: item.barcode, method: method || 'manual', qty: item.quantityPicked },
      });

      return {
        pickedItem: {
          lineItemId: item.lineItemId,
          quantityPicked: item.quantityPicked,
          quantityRequired: item.quantityRequired,
        },
        session: {
          id: session.id,
          items,
          totalRequired,
          totalPicked,
          totalMissing,
          isComplete,
          progressPercent: totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
          elapsedSeconds: elapsed,
        },
      };
    });

    if ('error' in result) {
      if (result.error === 'not_found') {
        return NextResponse.json(
          { success: false, error: 'No hay sesión activa' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      pickedItem: result.pickedItem,
      session: result.session,
    });
  } catch (error) {
    console.error('Error picking item:', error);
    return errorResponse(error);
  }
}
