# Pickup System — Marcela Koury

Sistema de pickeo / preparación de pedidos sobre **Next.js 16** (App Router, React 19),
**PostgreSQL + MikroORM** y proxy a **Medusa v2**. Flujo: picking → packing →
faltantes/vouchers → envío/entrega → portal de tienda + panel admin.

## Requisitos

- Node 22+
- PostgreSQL (instancia dedicada para este sistema)
- Un backend Medusa v2 accesible

## Variables de entorno (`.env.local`)

Todas son **obligatorias** (la app falla al arrancar si falta alguna; no hay defaults):

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión a Postgres, ej. `postgres://user:pass@host:5432/pickup` |
| `SESSION_SECRET` | Secreto para firmar las sesiones (HMAC). Largo y aleatorio. |
| `ADMIN_PIN` | PIN de administrador. |
| `MEDUSA_BACKEND_URL` | URL del backend Medusa. |
| `MEDUSA_SECRET_API_KEY` | API key (Basic) de Medusa. |
| `STATS_API_KEY` | API key de SOLO LECTURA para el dashboard externo. |
| `STATS_CORS_ORIGIN` | (opcional) Orígenes CORS permitidos, separados por coma. Sin valor = mismo origen. |

## Setup

```bash
npm install
# 1) Crear el schema en el Postgres dedicado
npm run db:setup
# 2) (Solo migración inicial desde Mongo) copiar todos los datos.
#    Requiere MONGODB_URI ademas de DATABASE_URL, con la base Mongo accesible.
npm run db:migrate-from-mongo
# 3) Levantar
npm run dev
```

## Arquitectura

- `src/lib/config.ts` — configuración validada (sin defaults).
- `src/lib/db.ts` — init de MikroORM (cache global + `em.fork()` por request).
- `src/lib/entities/*` — entidades (EntitySchema). `picking_items` es tabla hija de `picking_sessions`.
- `src/lib/session.ts` — `getSession` / `requireSession` / `requireRole` (HMAC, compare en tiempo constante).
- `src/lib/medusa.ts` — cliente de Medusa + cache de órdenes.
- `src/lib/shipping.ts` — clasificación de envíos **dinámica** por el nombre del método que envía Medusa.
- `src/middleware.ts` — auth: la `STATS_API_KEY` solo autoriza GET; las mutaciones requieren sesión; CORS por allowlist.
- `src/components/ui/*` — design system (Button, Card, Badge, Input/PinInput, Alert, Spinner, Modal/ConfirmDialog, Tabs, AuthCard).

## Seguridad

- Sesiones HMAC en cookie httpOnly (picker, tienda y admin).
- PIN hasheado con HMAC + pepper (migración lazy de los sha256 heredados en el primer login).
- Roles: las rutas `/api/admin/*`, gestión (mutaciones) y `users` (write) exigen rol admin.

## Scripts

| Script | Acción |
|--------|--------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run db:setup` | Crea/actualiza el schema de Postgres |
| `npm run db:migrate-from-mongo` | Migra todos los datos de Mongo a Postgres (una vez) |
