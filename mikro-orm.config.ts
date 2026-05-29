import { defineConfig } from '@mikro-orm/postgresql';
import { buildOrmOptions } from './src/lib/db';

// Config para la CLI de MikroORM y los scripts (tsx). La app usa lib/db.ts.
export default defineConfig(buildOrmOptions());
