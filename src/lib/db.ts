import { MikroORM, type Options, type EntityManager } from '@mikro-orm/postgresql';
import { entities } from './entities';
import { config } from './config';

/**
 * Opciones de MikroORM compartidas por la app (runtime), los scripts de setup
 * y la CLI. `disableDynamicFileAccess` evita que MikroORM escanee el filesystem
 * (necesario para que ande bien con el bundler de Next / serverless): pasamos
 * las entidades explícitamente vía EntitySchema.
 */
/**
 * Decide si la conexión necesita SSL. Lo prendemos para hosts remotos
 * (p. ej. la URL pública de Railway) y lo apagamos para local y la red interna
 * de Railway, donde no hace falta. Evita el típico error "SSL required" /
 * "self signed certificate" al conectar desde afuera.
 */
function needsSsl(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.endsWith('.railway.internal')) return false; // red interna de Railway
  return true;
}

export function buildOrmOptions(): Options {
  const url = config.databaseUrl;
  return {
    clientUrl: url,
    entities,
    discovery: { disableDynamicFileAccess: true },
    debug: false,
    pool: { min: 0, max: 10 },
    driverOptions: needsSsl(url)
      ? { connection: { ssl: { rejectUnauthorized: false } } }
      : {},
  };
}

// Cache global para no reinicializar el ORM en cada request (hot reload de Next).
declare global {
  // eslint-disable-next-line no-var
  var __ormPromise: Promise<MikroORM> | undefined;
}

export async function getOrm(): Promise<MikroORM> {
  if (!global.__ormPromise) {
    global.__ormPromise = MikroORM.init(buildOrmOptions());
  }
  return global.__ormPromise;
}

/**
 * Devuelve un EntityManager fresco (fork) por request. Es CLAVE en serverless:
 * cada request tiene su propia Unit of Work / identity map, sin fugas entre
 * requests concurrentes.
 */
export async function getEm(): Promise<EntityManager> {
  const orm = await getOrm();
  return orm.em.fork();
}
