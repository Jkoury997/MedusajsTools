/**
 * Helper compartido para crear el fulfillment de una orden en Medusa.
 *
 * Centraliza el reintento ante "No stock reservation found": algunas órdenes
 * (ML/ERP) llegan sin reserva de inventario y Medusa rechaza el fulfillment con
 * un 500. En ese caso reservamos el inventario y reintentamos una vez.
 *
 * Lo usan los flujos de cierre de picking/ola (complete / wave-complete) y de
 * resolución de faltantes (voucher / receive) para no duplicar la lógica.
 */
import { medusaRequest } from './medusa';

export interface FulfillmentItem {
  id: string;
  quantity: number;
}

/**
 * Crea un fulfillment en Medusa con los items dados. No-op si no hay items con
 * cantidad > 0. Reintenta una vez creando reservas si la orden no tenía.
 */
export async function createFulfillmentForOrder(
  orderId: string,
  items: FulfillmentItem[],
): Promise<void> {
  const fulfillmentItems = items.filter((i) => i.quantity > 0);
  if (fulfillmentItems.length === 0) return;

  const createFulfillment = () =>
    medusaRequest(`/admin/orders/${orderId}/fulfillments`, {
      method: 'POST',
      body: { items: fulfillmentItems },
    });

  try {
    await createFulfillment();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No stock reservation found')) {
      await medusaRequest(`/admin/orders/${orderId}/reserve-inventory`, { method: 'POST' });
      await createFulfillment();
    } else {
      throw err;
    }
  }
}

/**
 * Calcula, por línea de la orden, cuánto falta cumplir para llegar al objetivo
 * dado, descontando lo YA cumplido en Medusa (fulfillments no cancelados).
 *
 * `targetByLineItem` es la cantidad TOTAL que debería quedar cumplida por
 * lineItemId (p. ej. lo pickeado, o pickeado + faltante recibido). Las líneas
 * de la orden que no figuran en el mapa nunca se despachan.
 */
export async function computeRemainingFulfillmentItems(
  orderId: string,
  targetByLineItem: Map<string, number>,
): Promise<FulfillmentItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await medusaRequest<{ order: any }>(
    `/admin/orders/${orderId}?fields=+items.*,+fulfillments.*,+fulfillments.items.*`
  );
  const order = data.order;

  const fulfilledByLineItem = new Map<string, number>();
  for (const fulfillment of order.fulfillments || []) {
    if (fulfillment.canceled_at) continue;
    for (const fi of fulfillment.items || []) {
      if (!fi.line_item_id) continue;
      const prev = fulfilledByLineItem.get(fi.line_item_id) || 0;
      fulfilledByLineItem.set(fi.line_item_id, prev + (Number(fi.quantity) || 0));
    }
  }

  const remaining: FulfillmentItem[] = [];
  for (const item of order.items || []) {
    const target = targetByLineItem.get(item.id) || 0;
    const quantity = target - (fulfilledByLineItem.get(item.id) || 0);
    if (quantity > 0) remaining.push({ id: item.id, quantity });
  }
  return remaining;
}

/**
 * Crea el fulfillment necesario para llevar la orden hasta `targetByLineItem`,
 * descontando lo ya cumplido. Idempotente: si no queda nada por cumplir (p. ej.
 * un reintento después de que el fulfillment sí se creó), no hace nada.
 *
 * @returns created=true si se creó un fulfillment nuevo en esta llamada.
 */
export async function fulfillRemainingForOrder(
  orderId: string,
  targetByLineItem: Map<string, number>,
): Promise<{ created: boolean; items: FulfillmentItem[] }> {
  const items = await computeRemainingFulfillmentItems(orderId, targetByLineItem);
  if (items.length === 0) return { created: false, items };
  await createFulfillmentForOrder(orderId, items);
  return { created: true, items };
}
