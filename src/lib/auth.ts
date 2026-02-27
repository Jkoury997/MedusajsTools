import { createHmac, randomBytes } from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'pickup-secret-2024';
const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 horas

if (SESSION_SECRET === 'pickup-secret-2024') {
  console.warn('[Security] Usando SESSION_SECRET por defecto. Configura SESSION_SECRET en .env para produccion.');
}

/** Crear token de sesión firmado con HMAC-SHA256 (compatible con middleware Edge) */
export function createSessionToken(userId: string, role: string): string {
  const expires = Date.now() + SESSION_DURATION;
  const data = `${userId}:${role}:${expires}`;
  const signature = createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

/** Generar API key segura con prefijo identificable */
export function generateApiKey(): string {
  return `mk_${randomBytes(32).toString('hex')}`;
}

export { SESSION_SECRET, SESSION_DURATION };
