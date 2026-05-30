import { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
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

// ==================== PIN reversible (para que el admin pueda verlo) ====================
// Se guarda CIFRADO (AES-256-GCM) con clave derivada del SESSION_SECRET, aparte
// del hash de login. Un dump de la base por sí solo NO revela los PINs.

function encKey(): Buffer {
  return createHash('sha256').update(config.sessionSecret).digest(); // 32 bytes
}

/** Cifra un PIN para almacenarlo de forma recuperable. Formato: iv:tag:cipher (hex). */
export function encryptPin(pin: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Descifra un PIN almacenado. Devuelve null si no hay valor o no se puede descifrar. */
export function decryptPin(payload?: string | null): string | null {
  if (!payload) return null;
  try {
    const [ivH, tagH, dataH] = payload.split(':');
    if (!ivH || !tagH || !dataH) return null;
    const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivH, 'hex'));
    decipher.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
