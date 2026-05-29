/**
 * Crea/actualiza el schema de Postgres a partir de las entidades.
 * Uso: DATABASE_URL=postgres://... npx tsx scripts/setup-db.ts
 */
import { existsSync } from 'node:fs';
// Cargar .env.local (tsx no lo hace solo, a diferencia de Next.js).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

import { MikroORM } from '@mikro-orm/postgresql';
import { buildOrmOptions } from '../src/lib/db';

async function main() {
  const orm = await MikroORM.init(buildOrmOptions());
  const generator = orm.getSchemaGenerator();
  await generator.updateSchema();
  console.log('[setup-db] ✅ Schema de Postgres actualizado');
  await orm.close(true);
}

main().catch((err) => {
  console.error('[setup-db] ❌ Error:', err);
  process.exit(1);
});
