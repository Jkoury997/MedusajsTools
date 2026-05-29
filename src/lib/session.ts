import { cookies, headers } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from './config';
import { HttpError } from './http';

export interface Session {
  userId: string;
  role: string;
}

/** Comparación de strings hex en tiempo constante (evita timing oracle). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Verifica un token de sesión firmado (HMAC-SHA256). Devuelve la sesión o null. */
export function verifyToken(token: string): Session | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, role, expiresStr, signature] = parts;
    const expires = parseInt(expiresStr, 10);
    if (!expires || Date.now() > expires) return null;
    const expected = createHmac('sha256', config.sessionSecret)
      .update(`${userId}:${role}:${expiresStr}`)
      .digest('hex');
    if (!safeEqualHex(signature, expected)) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

/**
 * Identidad del actual request, derivada SIEMPRE del token verificado
 * (cookie httpOnly o Bearer), NUNCA del body. Devuelve null si no hay sesión.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('picking-session')?.value;
  if (cookie) {
    const s = verifyToken(cookie);
    if (s) return s;
  }
  const auth = (await headers()).get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const s = verifyToken(auth.slice(7));
    if (s) return s;
  }
  return null;
}

/** Igual que getSession pero lanza 401 si no hay sesión válida. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'No autenticado');
  return s;
}

/** Exige que la sesión tenga uno de los roles dados; si no, lanza 401/403. */
export async function requireRole(...roles: string[]): Promise<Session> {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new HttpError(403, 'No autorizado');
  return s;
}
