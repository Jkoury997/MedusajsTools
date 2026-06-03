import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { PickingWave } from '@/lib/entities';
import { resolveStoreId, serializeWave } from '@/lib/wave';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const matchesCode = (x: any, code: string) =>
  (!!x.barcode && x.barcode === code) ||
  (!!x.sku && x.sku === code) ||
  (!!x.variantId && x.variantId === code);

// POST /api/picking/waves/:id/sort - Clasificar un ítem en la mesa (put-to-wall)
// Body: { barcode? | sku? | variantId? }
// Asigna a la letra del pedido de mayor prioridad (más antiguo) que aún lo necesite.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const { id } = await params;
    const body = await req.json();
    const code: string | undefined = body.barcode || body.sku || body.variantId;
    if (!code) throw new HttpError(400, 'Falta el código (barcode/sku/variantId)');

    const result = await em.transactional(async (tem) => {
      const wave = await tem.findOne(
        PickingWave,
        { id },
        { populate: ['lines', 'orders.items'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!wave) throw new HttpError(404, 'Ola no encontrada');
      await resolveStoreId(tem, session, wave.storeId);

      if (wave.status !== 'sorting') {
        throw new HttpError(400, `La ola está en "${wave.status}", no en clasificación`);
      }

      const line = wave.lines.getItems().find((l) => matchesCode(l, code));
      if (!line) throw new HttpError(400, `El código "${code}" no pertenece a esta ola`);

      // No se puede clasificar más de lo recolectado de ese SKU.
      const orders = wave.orders.getItems().sort((a, b) => a.priority - b.priority);
      let sortedForSku = 0;
      for (const o of orders) {
        for (const it of o.items.getItems()) {
          if (matchesCode(it, code)) sortedForSku += it.quantitySorted;
        }
      }
      if (sortedForSku >= line.quantityPicked) {
        throw new HttpError(
          400,
          `Ya distribuiste todo lo recolectado de ${line.sku || line.barcode} (${sortedForSku}/${line.quantityPicked})`
        );
      }

      // Pedido de mayor prioridad (más antiguo) que todavía necesita este SKU.
      let target: { order: (typeof orders)[number]; item: ReturnType<typeof orders[number]['items']['getItems']>[number] } | null = null;
      for (const o of orders) {
        const item = o.items.getItems().find((it) => matchesCode(it, code) && it.quantitySorted < it.quantityRequired);
        if (item) {
          target = { order: o, item };
          break;
        }
      }
      if (!target) {
        throw new HttpError(400, `Ningún pedido de la ola necesita ${line.sku || line.barcode}`);
      }

      target.item.quantitySorted += 1;

      // ¿El pedido quedó completo? (todos sus ítems clasificados)
      const orderComplete = target.order.items
        .getItems()
        .every((it) => it.quantitySorted >= it.quantityRequired);
      if (orderComplete) {
        target.order.status = 'ready';
        target.order.readyAt = new Date();
      }

      await tem.flush();

      audit({
        action: 'wave_sort',
        userName: session.userId,
        userId: session.userId === 'admin' ? undefined : session.userId,
        orderId: target.order.orderId,
        orderDisplayId: target.order.orderDisplayId,
        details: `Ola #${wave.displayNumber}: ${line.sku || line.barcode} → letra ${target.order.letter}`,
        metadata: { waveId: wave.id, letter: target.order.letter, sku: line.sku, barcode: line.barcode },
      });

      return {
        assignment: {
          letter: target.order.letter,
          orderId: target.order.orderId,
          orderDisplayId: target.order.orderDisplayId,
          sku: line.sku,
          barcode: line.barcode,
          title: line.title,
          orderComplete,
          itemSorted: target.item.quantitySorted,
          itemRequired: target.item.quantityRequired,
        },
        wave: serializeWave(wave),
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
