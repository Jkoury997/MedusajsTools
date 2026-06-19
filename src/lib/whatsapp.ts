import { formatWhatsAppNumber } from './format';

/** URL de QR (servicio externo) para un texto/URL dado. */
export function buildQRUrl(data: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    data,
  )}&format=png`;
}

/** Mensaje "pedido listo para retirar en tienda". */
export function buildPickupReadyMessage(orderDisplayId: number, storeName: string): string {
  return `Hola! Te escribimos de Marcela Koury. Tu pedido #${orderDisplayId} ya se encuentra disponible para retirar en nuestra tienda ${storeName}. Te esperamos!`;
}

/** URL de WhatsApp (wa.me) con un mensaje. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${formatWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/** URL de WhatsApp para avisar que un pedido está listo para retirar. */
export function buildPickupReadyUrl(phone: string, orderDisplayId: number, storeName: string): string {
  return buildWhatsAppUrl(phone, buildPickupReadyMessage(orderDisplayId, storeName));
}

/** Mensaje "pedido ya está en la tienda para retirar". */
export function buildInStoreMessage(orderDisplayId: number): string {
  return `Hola! Te escribimos de Marcela Koury. Tu pedido #${orderDisplayId} ya está en la tienda para que lo retires. Te esperamos!`;
}

/** URL de WhatsApp para avisar que un pedido ya está en la tienda. */
export function buildInStoreUrl(phone: string, orderDisplayId: number): string {
  return buildWhatsAppUrl(phone, buildInStoreMessage(orderDisplayId));
}
