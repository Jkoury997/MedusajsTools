// IDs de opciones de envío de Medusa
export const SHIPPING_OPTIONS = {
  FACTORY_PICKUP: 'so_01KFH4G808X366AH68DDXTAX1N',     // Retiro en fábrica
  STORE_PICKUP: 'so_01KFH4FG9Z8S5DM9RPG2KQH42R',       // Retiro en tiendas oficiales
  EXPRESS: 'so_01KFH4TSD7116NW7S4KKPNHR72',             // Envío rápido
  CORREO_ARGENTINO: 'so_01KFH4JFTSZVTT8FQNZN67B3F3',   // Correo Argentino
  VIA_CARGO: 'so_01KFH4MTJM949479VCNWZCEXNY',           // Vía Cargo a sucursal
  EXPRESO_CLIENTE: 'so_01KFH4NN4MVHERPZG3BKXZW65P',    // Expreso a cargo del cliente
} as const;

// Helpers
export function isFactoryPickup(shippingOptionId?: string): boolean {
  return shippingOptionId === SHIPPING_OPTIONS.FACTORY_PICKUP;
}

export function isExpressShipping(shippingOptionId?: string): boolean {
  return shippingOptionId === SHIPPING_OPTIONS.EXPRESS;
}

export function isStorePickup(shippingOptionId?: string): boolean {
  return shippingOptionId === SHIPPING_OPTIONS.STORE_PICKUP;
}

export function getShippingLabel(shippingOptionId?: string): string | null {
  switch (shippingOptionId) {
    case SHIPPING_OPTIONS.FACTORY_PICKUP: return 'Retiro en Fábrica';
    case SHIPPING_OPTIONS.EXPRESS: return 'Envío Rápido';
    case SHIPPING_OPTIONS.CORREO_ARGENTINO: return 'Correo Argentino';
    case SHIPPING_OPTIONS.STORE_PICKUP: return 'Retiro en Tienda';
    case SHIPPING_OPTIONS.VIA_CARGO: return 'Vía Cargo Sucursal';
    case SHIPPING_OPTIONS.EXPRESO_CLIENTE: return 'Expreso a Cargo del Cliente';
    default: return null;
  }
}
