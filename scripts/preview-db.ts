/**
 * Muestra el SQL que `db:setup` (updateSchema) ejecutaría, SIN aplicar nada.
 * Uso: DATABASE_URL=postgres://... npx tsx scripts/preview-db.ts
 */
import { existsSync } from 'node:fs';
// Cargar .env.local (tsx no lo hace solo, a diferencia de Next.js).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

import { MikroORM } from '@mikro-orm/postgresql';
import { buildOrmOptions } from '../src/lib/db';

async function main() {
  const orm = await MikroORM.init(buildOrmOptions());
  const generator = orm.getSchemaGenerator();
  const sql = await generator.getUpdateSchemaSQL();
  if (!sql.trim()) {
    console.log('[preview-db] ✅ Sin cambios pendientes: el schema ya está al día.');
  } else {
    console.log('[preview-db] SQL que aplicaría db:setup (NO se ejecutó nada):\n');
    console.log(sql);
  }
  await orm.close(true);
}

main().catch((err) => {
  console.error('[preview-db] ❌ Error:', err);
  process.exit(1);
});
