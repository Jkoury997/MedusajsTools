import { createHash } from 'crypto';

/**
 * Hashea un PIN.
 *
 * NOTA (Fase 1): por ahora replica el comportamiento legacy (sha256) para que la
 * migración Mongo→Postgres sea puramente de capa de datos. En Fase 2 esto pasa a
 * HMAC con un pepper de servidor (determinístico y queryable —el login es por
 * PIN— pero no vulnerable a rainbow tables), con migración lazy en el login.
 */
export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}
