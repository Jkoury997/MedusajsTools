import { createHmac, createHash } from 'crypto';
import { config } from './config';

/**
 * Hash canónico de un PIN: HMAC-SHA256 con el secreto del servidor como pepper.
 * Es determinístico (el login es por PIN, necesita lookup directo) pero NO es
 * vulnerable a rainbow tables: sin el secreto no se puede precomputar.
 */
export function hashPin(pin: string): string {
  return createHmac('sha256', config.sessionSecret).update(pin).digest('hex');
}

/** Hash legacy (sha256 sin salt) de los datos migrados de Mongo. */
export function legacyHashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

/**
 * Hashes a usar para buscar un usuario por PIN: el nuevo (HMAC) y el legacy
 * (sha256). Permite el login determinístico tanto de usuarios nuevos como
 * migrados. Usar con `{ pin: { $in: pinLookupHashes(pin) } }`.
 */
export function pinLookupHashes(pin: string): string[] {
  return [hashPin(pin), legacyHashPin(pin)];
}

/** True si el hash guardado es el legacy de este PIN (hay que re-hashear a HMAC). */
export function isLegacyStored(stored: string, pin: string): boolean {
  return stored === legacyHashPin(pin);
}
