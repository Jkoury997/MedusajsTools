# Plan de Remediación — MedusajsTools (pickup-system)

**Basado en:** `HANDOFF_AUDIT.md` (2026-05-29)
**Objetivo:** llevar el sistema a producción seguro y mantenible **sin reescribir**.
**Esfuerzo total estimado:** ~13-18 días de una persona, en 5 fases.
**Estrategia git:** una rama por fase (`fix/fase-0-secretos`, `fix/fase-1-auth`, …), PR + merge antes de la siguiente. No tocar `main` directo.

---

## Principios que guían el plan

1. **Centralizar antes que parchear.** La mayoría de bugs vienen de lógica duplicada y config dispersa. Primero creamos las piezas compartidas (`lib/config.ts`, `lib/session.ts`, `lib/shipping.ts` ampliado, helpers), después migramos.
2. **El servidor es la fuente de verdad.** Nada de autorización, cantidades ni IDs de actor que vengan del body del cliente.
3. **Atómico e idempotente** en todo lo que escribe a Mongo o dispara fulfillments en Medusa.
4. **Fallar al arrancar** si falta configuración crítica, en vez de degradar en silencio.
5. **Verificación por fase** (checklist al final de cada una). No avanzar si la anterior no quedó verde.

---

# FASE 0 — Incendio 🔴 (medio día, hacer HOY)

Riesgo activo en producción. No necesita rama elaborada — un PR chico y urgente.

### 0.1 Rotar la password de admin de Medusa
- La password está en `test-api.js:3` y en el historial de git. **Asumir comprometida.**
- Entrar a Medusa admin → cambiar la password de `jorge_koury@icloud.com`.
- Actualizar `MEDUSA_ADMIN_PASSWORD` en `.env.local` y en el hosting (Vercel/Railway).

### 0.2 Borrar `test-api.js` y limpiarlo del historial
```bash
git rm test-api.js
git commit -m "chore: eliminar test-api.js con credenciales"
# Limpiar del historial (requiere git-filter-repo)
pip install git-filter-repo
git filter-repo --path test-api.js --invert-paths --force
git push --force-with-lease origin main   # coordinar con cualquier otro que tenga el repo
```
- Si el repo es compartido, avisar a todos que vuelvan a clonar tras el force-push.

### 0.3 Borrar el log de PIN
- `app/login/page.tsx:20` → eliminar `console.log('Submitting PIN:', pin)`.

### 0.4 Confirmar que los secretos están seteados en prod
- Verificar en el hosting que existan y NO sean los defaults: `SESSION_SECRET`, `ADMIN_PIN`, `MEDUSA_SECRET_API_KEY`, `MONGODB_URI`, `STATS_API_KEY`.

**✅ Checklist Fase 0:** password rotada · `test-api.js` fuera del historial · sin log de PIN · envs de prod verificadas.

---

# FASE 1 — Auth y Seguridad 🔴 (3-5 días)

La fase más importante. Resuelve C2-C7 y A1-A6.

### 1.1 Crear `src/lib/config.ts` — configuración validada y centralizada
Reemplaza todos los `process.env.X || 'default'` dispersos. Falla al arrancar si falta algo crítico.

```ts
// src/lib/config.ts
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`[config] Falta la variable de entorno obligatoria: ${name}`);
  }
  return v;
}

export const config = {
  sessionSecret: required('SESSION_SECRET'),
  adminPin: required('ADMIN_PIN'),
  medusaBackendUrl: required('MEDUSA_BACKEND_URL'),
  medusaSecretApiKey: required('MEDUSA_SECRET_API_KEY'),
  mongodbUri: required('MONGODB_URI'),
  statsApiKey: required('STATS_API_KEY'),
  statsCorsOrigin: process.env.STATS_CORS_ORIGIN || '',  // ver 1.6
};
```
- Migrar `lib/auth.ts`, `lib/medusa.ts`, `lib/mongodb/connection.ts`, `middleware.ts` a leer de `config`.
- **Eliminar todos los defaults** `'pickup-secret-2024'`, `'9999'`, `'https://backend.marcelakoury.com'`, `''`.
- Nota: `middleware.ts` corre en Edge runtime — no puede importar el `config` con Node APIs. Para el middleware, leer `process.env.SESSION_SECRET` directo pero **sin fallback** (lanzar si no está).

### 1.2 Crear `src/lib/session.ts` — fuente única de identidad del actor
Hoy cada ruta toma `userId` del body. Esto lo centraliza y lo ata a la cookie/token verificado.

```ts
// src/lib/session.ts (runtime Node, usado en route handlers)
import { cookies, headers } from 'next/headers';
import { createHmac } from 'crypto';
import { config } from './config';

export interface Session { userId: string; role: string; }

export function verifyToken(token: string): Session | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, role, expiresStr, sig] = parts;
    if (Date.now() > parseInt(expiresStr)) return null;
    const expected = createHmac('sha256', config.sessionSecret)
      .update(`${userId}:${role}:${expiresStr}`).digest('hex');
    // comparación de tiempo constante
    if (!timingSafeEqualHex(sig, expected)) return null;
    return { userId, role };
  } catch { return null; }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('picking-session')?.value;
  if (cookie) { const s = verifyToken(cookie); if (s) return s; }
  const auth = (await headers()).get('authorization');
  if (auth?.startsWith('Bearer ')) return verifyToken(auth.slice(7));
  return null;
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'No autenticado');
  return s;
}

export async function requireRole(role: string): Promise<Session> {
  const s = await requireSession();
  if (s.role !== role) throw new HttpError(403, 'No autorizado');
  return s;
}
```
- Agregar `timingSafeEqualHex` con `crypto.timingSafeEqual` (resuelve C4 del audit — comparación no constante).
- Agregar una clase `HttpError` + un wrapper `handleRoute()` que convierta `HttpError` en `NextResponse.json` con el status correcto, para no repetir try/catch.

### 1.3 Sacar el `userId` del body en TODAS las rutas (C5)
Rutas afectadas: `session/[orderId]/route.ts`, `session/[orderId]/complete`, `/pack`, `/pick`, `/unpick`, `/missing`, `picking/deliver`.
- Patrón: al inicio del handler, `const session = await requireSession()` → usar `session.userId` y resolver el usuario en Mongo desde ahí.
- Borrar `userId` de los bodies y de los tipos. El cliente ya no lo manda.
- Para `userName` en audit logs: resolver desde el usuario de la sesión, nunca hardcodear `'Admin'`/`'Gestión'`.

### 1.4 Chequeo de rol admin en rutas admin (C4, A3)
- `api/admin/api-keys/route.ts` (GET/POST/DELETE): `await requireRole('admin')` al inicio.
- `api/picking/users/route.ts` y `users/[userId]/route.ts` (POST/PUT/DELETE): `await requireRole('admin')`.
- En `middleware.ts`, branch de `API_KEY_PATHS`: para paths que empiezan con `/api/admin/`, si entra por cookie de sesión exigir `session.role === 'admin'` (la API key sigue siendo válida solo para stats de lectura — ver 1.5).

### 1.5 Separar scope read (stats) vs write (gestion) (A2)
- Definir dos listas en `middleware.ts`:
  - `STATS_READ_PATHS` (`/api/stats/`, `/api/picking/audit`, `/history`, `/users` GET, `/stores` GET, `/orders-count`): acepta `STATS_API_KEY` **o** sesión.
  - `GESTION_WRITE_PATHS` (`/api/gestion/ship`, `/deliver`, `/faltantes`, `/faltantes/voucher`, `/faltantes/receive`): **solo sesión con rol** (no la stats key). Decidir si requiere `admin` o un rol `gestion`.
- Usar prefijos con `/` final (`'/api/gestion/'`) para evitar el match laxo de `startsWith` (A6 del audit).

### 1.6 CORS allowlist (C audit / middleware:5)
- Quitar el default `'*'`. Si `STATS_CORS_ORIGIN` no está, no setear headers CORS (mismo origen).
- Soportar lista separada por comas y reflejar el origin solo si está en la lista.

### 1.7 Hash de PIN con KDF (A1)
- Reemplazar `hashPin` (SHA-256) por `bcrypt` (o `@node-rs/argon2`).
- `models.ts`: agregar `bcrypt.hashSync(pin, 10)` y `bcrypt.compareSync`.
- **Migración:** los PINs existentes están en SHA-256. Estrategia: en el login, si el hash guardado tiene formato viejo (64 hex) y matchea por SHA-256, re-hashear con bcrypt y guardar. Así migra solo al usar. Documentar y, tras unas semanas, forzar reset de los que no entraron.
- Quitar `unique: true` de `pin` en el schema (filtra colisiones); si se quiere unicidad, validar en app.

### 1.8 IDOR de tienda y regex injection
- `store-orders/route.ts` (A5): resolver `storeId` desde el usuario de la sesión (que es `role: 'store'` con `storeId`), ignorar el del query, o validar que coincidan.
- `audit/route.ts:23` (A6): escapar el input antes de `$regex` (función `escapeRegex`) o usar match exacto.

### 1.9 `stores` GET no destructivo (A4)
- Quitar el `deleteMany` del GET. Mover el sync Medusa→Store a un endpoint POST admin explícito o a un cron. El GET solo lee.

### 1.10 Migrar auth de tienda a cookie httpOnly (C7)
- `store-auth/route.ts`: en vez de devolver `data.token`, setear cookie httpOnly `picking-session` (mismo patrón que `picking/login`).
- `app/tienda/page.tsx`: quitar el token del estado y los headers `Authorization` manuales; usar `credentials: 'include'`.
- `STORE_TOKEN_PATHS` del middleware puede simplificarse (ya todo es cookie).
- Confirmar el bug H1 del audit: el cambio de PIN de tienda pega a `/api/picking/auth` (endpoint de picker) — corregir al endpoint de tienda.

**✅ Checklist Fase 1:**
- App no arranca si falta un secreto · no quedan defaults en el código.
- Ninguna ruta lee `userId`/rol del body.
- `requireRole('admin')` en api-keys y users · stats key no puede mutar.
- PIN con bcrypt + migración al login · CORS sin `*` · tienda con cookie httpOnly.
- Probar manualmente: picker no puede crear usuarios, stats key no puede despachar, sesión forjada con secreto viejo es rechazada.

---

# FASE 2 — Integridad de datos 🟠 (3-4 días)

Resuelve A7, A8, A9 — duplicación de fulfillments, vouchers, cantidades.

### 2.1 Operaciones atómicas en pick/unpick/missing (A9)
- Reemplazar el patrón load → mutar array `items` → `session.save()` por `findOneAndUpdate` con operadores posicionales y `arrayFilters`:
```ts
await PickingSession.findOneAndUpdate(
  { orderId, 'items.lineItemId': lineItemId, 'items.quantityPicked': { $lt: required } },
  { $inc: { 'items.$.quantityPicked': 1 } },
  { new: true }
);
```
- Esto elimina la condición de carrera del escaneo rápido con pistola.
- Quitar el doble `session.save()` de `pick/route.ts`.

### 2.2 `complete` correcto y atómico (A8)
- `complete/route.ts:108`: cambiar el fallback `item.quantity` por `0`. Si un line item no tiene item de sesión, fulfillea 0 (no la cantidad total).
- Reordenar: **fulfillear en Medusa primero**, y solo si tiene éxito marcar la sesión `completed`. Si falla, dejar estado intermedio (`pending_fulfillment`) y permitir reintento. Nunca marcar completado con fulfillment fallido en silencio.
- Devolver `fulfillmentCreated: boolean` real y que el mensaje al cliente refleje el estado verdadero.

### 2.3 Idempotencia en faltantes y vouchers (A7)
- `faltantes/voucher/route.ts`:
  - Validar `value`: número positivo, finito, ≤ tope razonable (ej. config). Rechazar con 400 si no.
  - Guardar antes de crear: si `session.faltanteResolution === 'voucher'` ya tiene voucher → no crear otro, devolver el existente.
  - `generateVoucherCode`: usar `crypto.randomBytes` en vez de `Math.random()`.
- `faltantes/receive/route.ts` y `faltantes/route.ts`: usar `findOneAndUpdate` con `$inc` y guarda `quantityReceived < quantityMissing`; chequear fulfillments existentes en Medusa antes de crear uno nuevo. Devolver `fulfillmentCreated`/`fulfillmentError` (no swallowear — finding 16 del audit).

### 2.4 `audit()` confiable (finding 9)
- Hacer que `audit()` capture y loguee su propio error siempre (ya lo hace parcialmente), y revisar que ningún `audit()` quede como promesa colgada sin catch. Mantener fire-and-forget pero con catch garantizado dentro de la función.

**✅ Checklist Fase 2:**
- Escanear el mismo item 2 veces en paralelo no duplica cantidades.
- `complete` con item sin pickear no fulfillea de más; falla visible si Medusa rechaza.
- Doble POST de voucher no crea dos promos.
- Receive concurrente no duplica fulfillments.

---

# FASE 3 — Config, duplicación y deuda 🟡 (4-6 días)

Resuelve los hallazgos MEDIO. Es lo que hace que el código "se sienta mal".

### 3.1 Unificar clasificación de pedidos
- Toda detección de tipo de envío usa `lib/shipping.ts` por **`shipping_option_id`**, nunca por substring del nombre.
- Borrar las heurísticas de nombre de `gestion/route.ts:50-56,196-198` y `store-orders/route.ts:38`.
- Crear `classifyOrder(order)` en `lib/shipping.ts` que devuelva el bucket (`preparar`/`enviar`/`enviados`/`store_pickup`/`faltante`). Usarlo **una sola vez** y reusar para lista y conteos en `gestion/route.ts` (hoy se calcula dos veces y divergen).
- Mover los IDs `so_01KFH...` a `config`/env (siguen pudiendo tener defaults documentados, pero idealmente por env por entorno).

### 3.2 Etiqueta de tienda — una sola fuente
- Extraer `buildStoreLabelHtml(order, store)` a `src/lib/store-label.ts`.
- `gestion/page.tsx:623` (`printStoreLabel`) y `StoreLabel.tsx:56` consumen el mismo builder.

### 3.3 Helpers compartidos
- `src/lib/format.ts`: `formatWhatsAppNumber` (hoy duplicado 4×), templates de mensaje de voucher (3×).
- `src/hooks/useAudioFeedback.ts`: extraer el hook de audio/vibración (copy-paste en `PickingInterface`, `FaltanteReceiveInterface`, `recibir/page`). Tipar `webkitAudioContext` y hacer `close()` en cleanup.
- `src/lib/serialize-session.ts`: `serializeSession(session)` con la fórmula única de `isComplete = quantityPicked + quantityMissing >= quantityRequired` (hoy `unpick` usa otra — finding 15). Usar en GET/POST/pick/unpick/missing.

### 3.4 Voucher estructurado (finding H5)
- La API de gestión devuelve `voucher: { code, value }` como campos, no embebido en `faltanteNotes`. El cliente deja de parsear con regex (`gestion/page.tsx:664`).

### 3.5 Validación de inputs
- Agregar `zod` (o validación manual consistente). Validar bodies en todas las rutas POST/PUT y params de fecha en `stats/*` (`stats/activity`, `/faltantes`, `/picking`) → 400 en `Invalid Date`, no 500.

### 3.6 Logging consistente
- Que todo `catch` haga `console.error` con contexto (varios hoy lo swallowean: `auth`, `admin-auth`, `users/[userId]`). Idealmente un mini logger en `lib/log.ts`.

### 3.7 Borrar código muerto
- Confirmar y eliminar `components/OrderTabs.tsx` y `components/RefreshButton.tsx` si están huérfanos (la home redirige a `/gestion` con otro sistema de tabs).

### 3.8 Partir archivos gigantes
- `gestion/page.tsx` (1219), `PickingInterface.tsx` (1237), `pedido/[id]/page.tsx` (669): extraer los `*Card`, el label printer y los sub-componentes a módulos propios. Hacerlo **después** de 3.2/3.3 para que las extracciones reusen los helpers.

**✅ Checklist Fase 3:**
- Una sola función clasifica pedidos · counts y lista coinciden siempre.
- Cero duplicados de `formatWhatsAppNumber`, etiqueta, hook de audio.
- Bodies y fechas validados · catches con log · sin código muerto · archivos < ~400 líneas.

---

# FASE 4 — Pulido 🟢 (2-3 días)

- Rate-limit con store compartido (Redis/Upstash) en vez de memoria (`rate-limit.ts`) — necesario en serverless. Considerar lockout por cuenta además de por IP.
- `next/image` en lugar de `<img>` para thumbnails/QR.
- Navegación con `router.refresh()`/`router.push()` en vez de `window.location.reload()` (`PrintButton`, `DeliverButton`, `PickingInterface:580`).
- Reemplazar `confirm()`/`alert()` nativos por el modal custom existente.
- Permitir pinch-zoom (`layout.tsx:29` — sacar `userScalable:false` salvo requisito kiosko).
- Normalizar acentos en strings ("conexión", "Auditoría", "Métricas", "configuración").
- Reemplazar casts `any`/`Record<string,any>` por tipos reales donde oculten bugs.
- Reescribir el `README.md` (hoy es el default de create-next-app) con setup real, variables de entorno y arquitectura.

**✅ Checklist Fase 4:** lint limpio · `npm run build` sin warnings · README útil.

---

## Tabla resumen de fases

| Fase | Tema | Días | Hallazgos que cierra |
|------|------|------|----------------------|
| 0 | Incendio (secretos) | 0.5 | C1, C6 |
| 1 | Auth y seguridad | 3-5 | C2-C7, A1-A6, A10 |
| 2 | Integridad de datos | 3-4 | A7, A8, A9, #9, #16 |
| 3 | Config y duplicación | 4-6 | todos los MEDIO |
| 4 | Pulido | 2-3 | todos los BAJO |

## Archivos nuevos que crea el plan
`lib/config.ts` · `lib/session.ts` · `lib/store-label.ts` · `lib/format.ts` · `lib/serialize-session.ts` · `lib/log.ts` · `hooks/useAudioFeedback.ts`

## Dependencias a agregar
`bcrypt` (o `@node-rs/argon2`) · `zod` · (Fase 4) cliente Redis/Upstash para rate-limit.

## Cómo verificar cada fase
1. `npm run build` y `npm run lint` verdes.
2. Pruebas manuales del checklist de la fase (rol picker no escala, escaneo concurrente no duplica, etc.).
3. Smoke test del flujo completo: login → picking → faltante/voucher → completar → envío/entrega → portal tienda.
4. PR con descripción de qué hallazgos del audit cierra; merge antes de la siguiente fase.
