import { MikroORM, type Options, type EntityManager } from '@mikro-orm/postgresql';
import { entities } from './entities';
import { config } from './config';

/**
 * Opciones de MikroORM compartidas por la app (runtime), los scripts de setup
 * y la CLI. `disableDynamicFileAccess` evita que MikroORM escanee el filesystem
 * (necesario para que ande bien con el bundler de Next / serverless): pasamos
 * las entidades explícitamente vía EntitySchema.
 */
export function buildOrmOptions(): Options {
  return {
    clientUrl: config.databaseUrl,
    entities,
    discovery: { disableDynamicFileAccess: true },
    debug: false,
    pool: { min: 0, max: 10 },
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
