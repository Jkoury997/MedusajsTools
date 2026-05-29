/**
 * Clasificación de envíos DINÁMICA: se basa en el nombre del método de envío que
 * envía Medusa en cada orden (no en IDs `so_...` hardcodeados). Una única fuente
 * de verdad para toda la app (gestión, tienda, pedido, stats, deliver, ship).
 */

export type ShippingCategory =
  | 'factory_pickup'
  | 'store_pickup'
  | 'express'
  | 'correo'
  | 'via_cargo'
  | 'expreso_cliente'
  | 'other';

const norm = (s?: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // sacar acentos

/**
 * Clasifica un método de envío por su nombre. El ORDEN importa: resuelve
 * ambigüedades (p. ej. "Vía Cargo a sucursal" es via_cargo, no retiro en tienda).
 */
export function classifyShippingName(name?: string): ShippingCategory {
  const n = norm(name);
  if (!n) return 'other';
  if (n.includes('fabrica')) return 'factory_pickup';
  if (n.includes('cargo')) return 'via_cargo';
  if (n.includes('expreso')) return 'expreso_cliente';
  if (n.includes('rapido') || n.includes('express')) return 'express';
  if (n.includes('correo')) return 'correo';
  if (n.includes('tienda') || n.includes('oficial') || n.includes('retiro') || n.includes('pickup'))
    return 'store_pickup';
  return 'other';
}

interface OrderLike {
  shipping_methods?: { name?: string }[] | null;
}

/** Categoría de envío de una orden (toma el primer método). */
export function classifyOrder(order: OrderLike): ShippingCategory {
  return classifyShippingName(order.shipping_methods?.[0]?.name);
}

// Helpers booleanos (ahora por NOMBRE del método, no por ID).
export function isFactoryPickup(name?: string): boolean {
  return classifyShippingName(name) === 'factory_pickup';
}
export function isStorePickup(name?: string): boolean {
  return classifyShippingName(name) === 'store_pickup';
}
export function isExpressShipping(name?: string): boolean {
  return classifyShippingName(name) === 'express';
}

const CATEGORY_LABELS: Record<ShippingCategory, string> = {
  factory_pickup: 'Retiro en Fábrica',
  store_pickup: 'Retiro en Tienda',
  express: 'Envío Rápido',
  correo: 'Correo Argentino',
  via_cargo: 'Vía Cargo Sucursal',
  expreso_cliente: 'Expreso a Cargo del Cliente',
  other: 'Envío',
};

/** Etiqueta legible de una categoría. */
export function getCategoryLabel(category: ShippingCategory): string {
  return CATEGORY_LABELS[category];
}

/** Etiqueta legible a partir del nombre del método (o null si no se reconoce). */
export function getShippingLabel(name?: string): string | null {
  const cat = classifyShippingName(name);
  return cat === 'other' ? null : CATEGORY_LABELS[cat];
}
