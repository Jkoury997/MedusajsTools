/**
 * Fase 4 — Cierre y envío de una ola. Al cerrar, cada letra "lista" se
 * MATERIALIZA como una PickingSession completada (igual a la que generaría el
 * flujo individual) + su fulfillment en Medusa. Así los pedidos caen en el
 * pipeline existente (por enviar / faltantes / voucher / ship / etiqueta / stats)
 * sin tocar nada de ese flujo.
 */
import type { EntityManager } from '@mikro-orm/postgresql';
import { PickingSession, PickingItem, User } from './entities';
import { audit } from './audit';
import { medusaRequest } from './medusa';
import { createFulfillmentForOrder } from './fulfillment';

export interface FinalizeResult {
  orderId: string;
  orderDisplayId: number;
  letter: string;
  fulfillmentCreated: boolean;
  fulfillmentError?: string;
  totalMissing: number;
  skipped?: 'already_completed' | 'in_progress_elsewhere';
}

/**
 * Crea el fulfillment en Medusa con las cantidades realmente clasificadas.
 * El reintento ante falta de reserva (ML/ERP) vive en createFulfillmentForOrder.
 */
async function createFulfillmentInMedusa(
  orderId: string,
  pickedByLineItem: Map<string, number>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderData = await medusaRequest<{ order: any }>(
    `/admin/orders/${orderId}?fields=+items.*,+shipping_methods.*`
  );
  const order = orderData.order;
  const fulfillmentItems = order.items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({ id: item.id, quantity: pickedByLineItem.get(item.id) || 0 }));

  await createFulfillmentForOrder(orderId, fulfillmentItems);
}

/**
 * Materializa una letra (pedido) de la ola como PickingSession completada + fulfillment.
 * Idempotente: si ya hay una sesión para el pedido (de esta ola o del flujo
 * individual), no duplica. El fulfillment se crea ANTES de materializar la
 * sesión: si falla, no queda sesión y el reintento vuelve a intentarlo.
 */
export async function finalizeWaveOrder(
  em: EntityManager,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waveOrder: any,
  user: User,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wave: any
): Promise<FinalizeResult> {
  const orderId: string = waveOrder.orderId;
  const items = waveOrder.items.getItems();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalRequired = items.reduce((s: number, i: any) => s + i.quantityRequired, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPicked = items.reduce((s: number, i: any) => s + i.quantitySorted, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalMissing = items.reduce((s: number, i: any) => s + i.quantityMissing, 0);
  const hasMissing = totalMissing > 0;

  const base: FinalizeResult = {
    orderId,
    orderDisplayId: waveOrder.orderDisplayId,
    letter: waveOrder.letter,
    fulfillmentCreated: false,
    totalMissing,
  };

  // Idempotencia / convivencia con el flujo individual.
  const existing = await em.findOne(PickingSession, {
    orderId,
    status: { $in: ['in_progress', 'completed'] },
  });
  if (existing) {
    return {
      ...base,
      fulfillmentCreated: existing.fulfillmentStatus === 'created',
      skipped: existing.status === 'completed' ? 'already_completed' : 'in_progress_elsewhere',
    };
  }

  // PASO 1: fulfillment (antes de materializar la sesión). Si hay faltantes,
  // no se crea ahora (se crea cuando se reciba todo, vía flujo de faltantes).
  let fulfillmentStatus: 'none' | 'created' = 'none';
  if (!hasMissing) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const picked = new Map<string, number>(items.map((i: any) => [i.lineItemId, i.quantitySorted]));
      await createFulfillmentInMedusa(orderId, picked);
      fulfillmentStatus = 'created';
      base.fulfillmentCreated = true;
    } catch (error) {
      const fulfillmentError = error instanceof Error ? error.message : 'Error al crear fulfillment';
      base.fulfillmentError = fulfillmentError;
      audit({
        action: 'fulfillment_error',
        userName: user.name,
        userId: user.id,
        orderId,
        orderDisplayId: waveOrder.orderDisplayId,
        details: `Error fulfillment (ola #${wave.displayNumber}): ${fulfillmentError}`,
      });
      // No materializamos la sesión: el reintento volverá a intentar el fulfillment.
      return base;
    }
  }

  // PASO 2: materializar la sesión completada (cae en el pipeline existente).
  const session = em.create(PickingSession, {
    orderId,
    orderDisplayId: waveOrder.orderDisplayId,
    status: 'completed',
    startedAt: wave.sortingStartedAt || wave.createdAt,
    completedAt: new Date(),
    user: em.getReference(User, user.id),
    userName: user.name,
    completedByName: user.name,
    totalRequired,
    totalPicked,
    totalMissing,
    fulfillmentStatus,
    faltanteResolution: hasMissing ? 'pending' : undefined,
  });
  for (const it of items) {
    em.create(PickingItem, {
      session,
      lineItemId: it.lineItemId,
      variantId: it.variantId,
      sku: it.sku,
      barcode: it.barcode,
      quantityRequired: it.quantityRequired,
      quantityPicked: it.quantitySorted,
      quantityMissing: it.quantityMissing,
    });
  }
  await em.persistAndFlush(session);

  if (fulfillmentStatus === 'created') {
    audit({
      action: 'fulfillment_create',
      userName: user.name,
      userId: user.id,
      orderId,
      orderDisplayId: waveOrder.orderDisplayId,
      details: `Fulfillment creado (ola #${wave.displayNumber}, letra ${waveOrder.letter})`,
    });
  }

  return base;
}
