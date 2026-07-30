/**
 * Helper compartido para crear el fulfillment de una orden en Medusa.
 *
 * Centraliza el reintento ante errores de reserva/stock: algunas órdenes
 * (ML/ERP) llegan sin reserva de inventario y Medusa rechaza el fulfillment con
 * un 500. En ese caso creamos reservas SOLO por las cantidades que se van a
 * despachar y reintentamos una vez. Reservar la orden COMPLETA (el viejo
 * reserve-inventory) rompía los despachos parciales: con faltantes, pedía
 * stock que no existe y bloqueaba el envío de lo que sí se pickeó.
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
 * Traduce el "Not enough stock available for item iitem_X at location sloc_Y"
 * de Medusa a un mensaje accionable para el operario: qué producto (SKU/título),
 * en qué depósito y cuánto hay disponible/reservado. Si la consulta extra falla,
 * devuelve null y se conserva el error original.
 */
async function humanizeStockError(rawMessage: string): Promise<string | null> {
  const match = rawMessage.match(
    /Not enough stock available for item (iitem_\w+) at location (sloc_\w+)/
  );
  if (!match) return null;
  const [, inventoryItemId, locationId] = match;

  try {
    const [itemData, locationData, levelsData] = await Promise.all([
      medusaRequest<{ inventory_item: { sku?: string; title?: string } }>(
        `/admin/inventory-items/${inventoryItemId}`
      ),
      medusaRequest<{ stock_location: { name?: string } }>(
        `/admin/stock-locations/${locationId}`
      ),
      medusaRequest<{
        inventory_levels: {
          stocked_quantity?: number;
          reserved_quantity?: number;
          available_quantity?: number;
        }[];
      }>(`/admin/inventory-items/${inventoryItemId}/location-levels?location_id=${locationId}`),
    ]);

    const item = itemData.inventory_item;
    const product = [item?.sku, item?.title].filter(Boolean).join(' — ') || inventoryItemId;
    const location = locationData.stock_location?.name || locationId;
    const level = levelsData.inventory_levels?.[0];
    const detail = level
      ? ` (en stock: ${level.stocked_quantity ?? '?'}, reservado: ${level.reserved_quantity ?? '?'}, disponible: ${level.available_quantity ?? '?'})`
      : '';

    return `Stock insuficiente de "${product}" en ${location}${detail}. El disponible ya descuenta lo reservado por otros pedidos sin despachar: liberá esas reservas o ajustá el stock en el admin de Medusa y reintentá.`;
  } catch {
    return null;
  }
}

interface ReservationRecord {
  id: string;
  line_item_id?: string | null;
  inventory_item_id: string;
  location_id: string;
  quantity: number;
}

/** Depósito con más disponible del artículo (para elegir dónde reservar). */
async function pickLocationForItem(inventoryItemId: string): Promise<string | undefined> {
  const data = await medusaRequest<{
    inventory_levels?: { location_id: string; available_quantity?: number }[];
  }>(`/admin/inventory-items/${inventoryItemId}/location-levels`);
  const levels = data.inventory_levels || [];
  if (levels.length === 0) return undefined;
  return levels.reduce((best, l) =>
    (l.available_quantity ?? 0) > (best.available_quantity ?? 0) ? l : best
  ).location_id;
}

/**
 * Garantiza que cada línea a despachar tenga reservas por AL MENOS la cantidad
 * a cumplir — y solo por eso. No se reserva el total de la orden: lo que quedó
 * como faltante se reserva recién cuando se resuelve (recepción o voucher).
 *
 * @returns cuántas reservas nuevas se crearon.
 */
async function ensureReservationsForItems(
  orderId: string,
  items: FulfillmentItem[],
): Promise<number> {
  const idParams = items.map((i) => `line_item_id[]=${encodeURIComponent(i.id)}`).join('&');
  const resData = await medusaRequest<{ reservations?: ReservationRecord[] }>(
    `/admin/reservations?${idParams}&limit=200`
  );
  const reservations = resData.reservations || [];

  const reservedByLine = new Map<string, number>();
  for (const r of reservations) {
    if (!r.line_item_id) continue;
    const prev = reservedByLine.get(r.line_item_id) || 0;
    reservedByLine.set(r.line_item_id, prev + (Number(r.quantity) || 0));
  }

  const deficits = items
    .map((i) => ({ lineItemId: i.id, missing: i.quantity - (reservedByLine.get(i.id) || 0) }))
    .filter((d) => d.missing > 0);
  if (deficits.length === 0) return 0;

  // inventory_item_id de cada línea con déficit, vía su variante.
  const orderData = await medusaRequest<{
    order: { items?: { id: string; variant_id?: string | null }[] };
  }>(`/admin/orders/${orderId}?fields=+items.*`);
  const variantByLine = new Map<string, string>();
  for (const it of orderData.order.items || []) {
    if (it.variant_id) variantByLine.set(it.id, it.variant_id);
  }

  const variantIds = [
    ...new Set(deficits.map((d) => variantByLine.get(d.lineItemId)).filter(Boolean)),
  ] as string[];
  const invItemByVariant = new Map<string, string>();
  if (variantIds.length > 0) {
    const vParams = variantIds.map((id) => `id[]=${encodeURIComponent(id)}`).join('&');
    const vData = await medusaRequest<{
      variants?: { id: string; inventory_items?: { inventory_item_id?: string }[] }[];
    }>(`/admin/product-variants?${vParams}&fields=id,inventory_items.inventory_item_id&limit=${variantIds.length}`);
    for (const v of vData.variants || []) {
      const invId = v.inventory_items?.[0]?.inventory_item_id;
      if (invId) invItemByVariant.set(v.id, invId);
    }
  }

  // Depósito: el de las reservas ya existentes de la orden; si no hay ninguna,
  // el nivel del propio artículo con más disponible.
  const defaultLocationId = reservations[0]?.location_id;

  let created = 0;
  for (const deficit of deficits) {
    const variantId = variantByLine.get(deficit.lineItemId);
    const inventoryItemId = variantId ? invItemByVariant.get(variantId) : undefined;
    // Sin inventario administrado, Medusa no exige reserva para esta línea.
    if (!inventoryItemId) continue;

    const locationId = defaultLocationId || (await pickLocationForItem(inventoryItemId));
    if (!locationId) continue;

    await medusaRequest('/admin/reservations', {
      method: 'POST',
      body: {
        line_item_id: deficit.lineItemId,
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        quantity: deficit.missing,
        description: `Reserva para despacho (orden ${orderId})`,
      },
    });
    created++;
  }
  return created;
}

/**
 * Crea un fulfillment en Medusa con los items dados. No-op si no hay items con
 * cantidad > 0. Ante falta de reserva o de stock, reintenta una vez reservando
 * SOLO las cantidades a despachar (nunca el total de la orden).
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
    const isReservationOrStock =
      msg.includes('No stock reservation found') || msg.includes('Not enough stock available');
    if (!isReservationOrStock) throw err;

    let retryErr: unknown = err;
    try {
      const created = await ensureReservationsForItems(orderId, fulfillmentItems);
      if (created === 0 && msg.includes('No stock reservation found')) {
        // Fallback legado: si no pudimos armar reservas dirigidas (p. ej. la
        // línea no resolvió inventory item), que Medusa reserve la orden entera.
        await medusaRequest(`/admin/orders/${orderId}/reserve-inventory`, { method: 'POST' });
      }
      await createFulfillment();
      return;
    } catch (e) {
      retryErr = e;
    }

    const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
    const humanized = (await humanizeStockError(retryMsg)) || (await humanizeStockError(msg));
    if (humanized) throw new Error(humanized);
    throw retryErr instanceof Error ? retryErr : err;
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
