import { createHmac } from 'crypto';
import { config } from './config';

const SESSION_DURATION = config.sessionDurationMs; // 12 horas

/** Crear token de sesión firmado con HMAC-SHA256 (compatible con middleware Edge). */
export function createSessionToken(userId: string, role: string): string {
  const expires = Date.now() + SESSION_DURATION;
  const data = `${userId}:${role}:${expires}`;
  const signature = createHmac('sha256', config.sessionSecret).update(data).digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

export { SESSION_DURATION };
