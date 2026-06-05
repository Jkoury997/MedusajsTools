/**
 * Helper compartido para crear el fulfillment de una orden en Medusa.
 *
 * Centraliza el reintento ante "No stock reservation found": algunas órdenes
 * (ML/ERP) llegan sin reserva de inventario y Medusa rechaza el fulfillment con
 * un 500. En ese caso reservamos el inventario y reintentamos una vez.
 *
 * Lo usan los flujos de cierre de ola (wave-complete) y de resolución de
 * faltantes (faltantes / voucher / receive) para no duplicar la lógica.
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
