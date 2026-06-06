/**
 * Rate limiter en memoria para proteger endpoints de autenticación contra
 * brute-force. Cuenta SOLO intentos FALLIDOS por IP en una ventana de tiempo y
 * se resetea ante un login exitoso.
 *
 * Importante: en un depósito todos los dispositivos suelen salir por una misma
 * IP pública (NAT). Si contáramos también los logins exitosos, varios pickers
 * legítimos agotarían el cupo y se bloquearían entre sí. Por eso solo penalizamos
 * los fallos (registerFailedAttempt) y limpiamos al autenticar bien (clearRateLimit).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateLimitEntry>();

const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

// Limpiar entradas expiradas cada 60 segundos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now > entry.resetAt) attempts.delete(key);
    }
  }, 60_000);
}

/** ¿La clave está bloqueada? NO incrementa el contador (solo consulta). */
export function isRateLimited(
  key: string,
  maxAttempts: number = DEFAULT_MAX,
): { blocked: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) return { blocked: false };
  if (entry.count >= maxAttempts) {
    return { blocked: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { blocked: false };
}

/** Registra un intento FALLIDO (lo único que cuenta para el bloqueo). */
export function registerFailedAttempt(key: string, windowMs: number = DEFAULT_WINDOW_MS): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
  }
}

/** Limpia el contador de una clave (llamar tras un login exitoso). */
export function clearRateLimit(key: string): void {
  attempts.delete(key);
}

/** Extraer IP del request (funciona con proxies como Vercel/Cloudflare) */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
