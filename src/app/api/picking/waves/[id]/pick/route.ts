import { NextRequest, NextResponse } from 'next/server';
import { LockMode } from '@mikro-orm/core';
import { getEm } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';
import { audit } from '@/lib/audit';
import { PickingWave } from '@/lib/entities';
import { serializeWave, attachLineDetails, resolveScanField, matchesScan } from '@/lib/wave';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/picking/waves/:id/pick - Recolección consolidada (+qty de un SKU)
// Body: { barcode? | sku? | variantId?, qty=1 }
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireSession();
    const em = await getEm();
    const { id } = await params;
    const body = await req.json();
    const code: string | undefined = body.barcode || body.sku || body.variantId;
    const qty: number = Math.max(1, parseInt(body.qty, 10) || 1);

    if (!code) throw new HttpError(400, 'Falta el código (barcode/sku/variantId)');

    const result = await em.transactional(async (tem) => {
      const wave = await tem.findOne(
        PickingWave,
        { id },
        { populate: ['lines', 'orders'], lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!wave) throw new HttpError(404, 'Ola no encontrada');

      if (!['draft', 'picking'].includes(wave.status)) {
        throw new HttpError(400, `La ola está en estado "${wave.status}", no se puede recolectar`);
      }

      // El barcode es el identificador único: matcheamos primero por barcode y
      // solo caemos a variantId si el código no es ningún barcode. Nunca por SKU
      // (se repite entre productos distintos).
      const lines = wave.lines.getItems();
      const field = resolveScanField(lines, code);
      const line = field ? lines.find(matchesScan(field, code)) : undefined;

      if (!line) {
        throw new HttpError(400, `El código "${code}" no pertenece a esta ola`);
      }
      if (line.quantityPicked >= line.quantityRequired) {
        throw new HttpError(400, `Ya recolectaste todo de ${line.sku || line.barcode} (${line.quantityPicked}/${line.quantityRequired})`);
      }

      const add = Math.min(qty, line.quantityRequired - line.quantityPicked);
      line.quantityPicked += add;

      if (wave.status === 'draft') {
        wave.status = 'picking';
        wave.pickingStartedAt = new Date();
      }
      await tem.flush();

      audit({
        action: 'wave_pick',
        userName: session.userId,
        userId: session.userId === 'admin' ? undefined : session.userId,
        details: `Ola #${wave.displayNumber}: pick ${line.sku || line.barcode} (${line.quantityPicked}/${line.quantityRequired})`,
        metadata: { waveId: wave.id, sku: line.sku, barcode: line.barcode, qty: add },
      });

      await wave.orders.init({ populate: ['items'] as never });
      return serializeWave(wave);
    });

    const detailed = await attachLineDetails(result);
    return NextResponse.json({ success: true, wave: detailed });
  } catch (error) {
    return errorResponse(error);
  }
}
