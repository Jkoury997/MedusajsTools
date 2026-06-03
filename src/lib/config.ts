/**
 * Configuración centralizada y validada.
 *
 * Cada valor obligatorio usa `required()` dentro de un getter: la validación
 * se dispara la PRIMERA vez que se accede al valor (en runtime), no al importar
 * el módulo. Así `next build` no falla por falta de envs, pero la app sí falla
 * rápido y claro si en runtime falta un secreto en producción.
 *
 * Reemplaza todos los `process.env.X || 'default'` dispersos por el código.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `[config] Falta la variable de entorno obligatoria: ${name}. ` +
        `Configurala en .env.local (dev) y en el hosting (prod).`,
    );
  }
  return v.trim();
}

function optional(name: string, fallback = ''): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

export const config = {
  /** Postgres dedicado del pickup-system (MikroORM). */
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  /** Secreto para firmar tokens de sesión (HMAC-SHA256). Sin default. */
  get sessionSecret(): string {
    return required('SESSION_SECRET');
  },
  /** PIN de administrador. Sin default. */
  get adminPin(): string {
    return required('ADMIN_PIN');
  },
  /** URL del backend de Medusa. Sin default. */
  get medusaBackendUrl(): string {
    return required('MEDUSA_BACKEND_URL');
  },
  /** API key secreta de Medusa (Basic auth). Sin default. */
  get medusaSecretApiKey(): string {
    return required('MEDUSA_SECRET_API_KEY');
  },
  /** API key para el dashboard externo de stats (solo lectura). */
  get statsApiKey(): string {
    return required('STATS_API_KEY');
  },
  /**
   * Allowlist de orígenes CORS para los endpoints de stats, separada por comas.
   * Vacío = sin CORS (mismo origen). Nunca usar '*' por default.
   */
  get statsCorsOrigins(): string[] {
    return optional('STATS_CORS_ORIGIN')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  },
  /**
   * Mapa `shipping_option_id` → grupo de prioridad de olas, en JSON.
   * Fuente de verdad EXACTA (los `so_...` de Medusa son estables), en vez de
   * adivinar por el nombre del método. Ej:
   *   SHIPPING_OPTION_GROUPS={"so_123":"express","so_456":"mercado_libre"}
   * Grupos válidos: express | mercado_libre | store_pickup | correo |
   * via_cargo | expreso_cliente | factory_pickup | other.
   * Vacío o un option_id sin mapear → cae al fallback por nombre.
   */
  get shippingOptionGroups(): Record<string, string> {
    const raw = optional('SHIPPING_OPTION_GROUPS');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  },
  /** Duración de la sesión en ms (12 horas). */
  sessionDurationMs: 12 * 60 * 60 * 1000,
} as const;
