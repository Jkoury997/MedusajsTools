# Hand-off Audit — MedusajsTools (pickup-system)

**Fecha:** 2026-05-29
**Alcance:** todo `src/` (12.7k LOC, 58 archivos), config, git.
**Stack:** Next.js 16 (App Router) · React 19 · MongoDB/Mongoose · proxy a Medusa v2.

---

## Veredicto: NO rehacer de cero. Remediar por fases.

La arquitectura es correcta y el dominio (picking → packing → faltantes → envío/entrega → tienda) ya está modelado y funcionando. Reescribir tiraría lógica de negocio probada y reintroduciría bugs. **Los problemas están concentrados en 3 áreas** y son arreglables sin tocar la estructura:

1. **Seguridad / auth** (lo más grave — varias rutas sin control de rol, secretos con defaults).
2. **Hardcodeo de configuración** (secretos, URL del backend, IDs de envío, nombres en logs).
3. **Duplicación de lógica** (clasificación de pedidos, etiquetas, hooks, formateadores).

Esfuerzo estimado de remediación: **~2 a 3 semanas** de una persona. Una reescritura sería 2-3 meses con el mismo resultado funcional.

---

## 🔴 CRÍTICO — arreglar antes de seguir en producción

| # | Dónde | Problema | Fix |
|---|-------|----------|-----|
| C1 | `test-api.js:2-3` (commiteado en git) | **Email y password de admin de Medusa en texto plano**, dentro del repo y en el historial de git. | Borrar el archivo, rotar la password de Medusa **ya**, y limpiar del historial (`git filter-repo`). |
| C2 | `lib/auth.ts:3`, `middleware.ts:3` | `SESSION_SECRET` cae a default `'pickup-secret-2024'` (está en el repo). Con eso cualquiera **forja un token de sesión admin** y pasa todo el middleware. Solo hay un `console.warn`. | Fallar al arrancar si no está seteado en prod. Nunca firmar/verificar con el default. |
| C3 | `api/picking/admin-auth/route.ts:5` | `ADMIN_PIN \|\| '9999'`: si la env no está, **el PIN 9999 da admin**. Además difiere de `login` y `auth` que no tienen fallback (inconsistente). | Quitar el `\|\| '9999'`; rechazar login admin si `ADMIN_PIN` no está. |
| C4 | `middleware.ts:89-122` + `api/admin/api-keys/route.ts` | `/api/admin/*` **no chequea rol admin**. El gate de rol (`middleware.ts:180`) solo aplica a la *página* `/admin`, no a la API. Cualquier sesión (picker/tienda) o la `STATS_API_KEY` de solo-lectura puede **crear/listar/revocar API keys**. | Exigir `session.role === 'admin'` en el branch de `/api/admin/*` y/o en el handler. |
| C5 | Toda la familia `session/*`, `deliver`, `complete`, `pack` | El actor se toma del `userId` **del body**, no de la sesión verificada. Un picker puede pasar el `userId` de otro (o `'admin'`) y **actuar/atribuirse como cualquiera**. `deliver/route.ts:27` trata `userId === 'admin'` como admin total sin verificar. | Derivar el actor del token de sesión (cookie/Bearer) en el handler; ignorar el `userId` del body para autorización. |
| C6 | `app/login/page.tsx:20` | `console.log('Submitting PIN:', pin)` — **loguea el PIN en plano** en la consola del navegador en cada login. | Borrar el `console.log`. |
| C7 | `app/tienda/page.tsx` | El **Bearer token de tienda vive en estado de React** y se devuelve crudo al cliente (`store-auth`); se usa en headers desde el cliente. Cualquier XSS = acceso de tienda. El resto de la app usa cookie httpOnly (patrón correcto en `picking/login`). | Migrar la auth de tienda a cookie httpOnly como el resto. No devolver tokens crudos al JS. |

---

## 🟠 ALTO

| # | Dónde | Problema |
|---|-------|----------|
| A1 | `models.ts:281` | `hashPin` = SHA-256 **sin salt** sobre un PIN de 4-6 dígitos. Un dump de la DB se revierte al instante con una tabla precomputada. Además `pin` es `unique`, lo que **filtra colisiones de PIN** y bloquea reuso legítimo. → bcrypt/scrypt/argon2 por usuario. |
| A2 | `middleware.ts:10-19` | `/api/gestion` (mutaciones reales: `ship`, `deliver`, `faltantes`, `voucher`) se autoriza con **la misma `STATS_API_KEY`** del dashboard de solo-lectura, o cualquier sesión sin chequeo de rol. Una key filtrada puede **despachar pedidos y crear vouchers (plata real)**. → separar scope read vs write. |
| A3 | `api/picking/users/*` | Crear/editar/borrar usuarios **sin chequeo de rol admin**; cualquier sesión autenticada puede. Además el audit log hardcodea `userName: 'Admin'` aunque no lo sea (traza falsa). |
| A4 | `api/picking/stores/route.ts:12-21` | Un **GET hace `deleteMany`** (destructivo en una lectura) + 3 fetchs de 200 órdenes a Medusa en cada llamada. Un GET debe ser idempotente. → mover el sync a un job/cron. |
| A5 | `api/picking/store-orders/route.ts:9,47` | **IDOR**: `storeId` viene del query string y no se valida contra la tienda del token. Un usuario de tienda lee pedidos (PII) de otras tiendas. |
| A6 | `api/picking/audit/route.ts:23` | `$regex` con input de usuario sin escapar → **ReDoS / inyección de regex**. |
| A7 | `faltantes/voucher/route.ts:19-46` | `value` solo se chequea truthy; acepta negativos/enormes/strings y **crea una promo real en Medusa**. Sin idempotencia: POSTs repetidos crean múltiples vouchers para el mismo pedido. |
| A8 | `complete/route.ts:108` | Si un line item de Medusa no matchea un item de sesión, fulfillea `item.quantity` (cantidad **total pedida**) en vez de 0 → fulfillea mercadería nunca pickeada. |
| A9 | `complete/route.ts:62-114`, `faltantes/receive/route.ts:92`, `faltantes/route.ts:62` | Flujos **no atómicos ni idempotentes** (read-modify-save). Dos escaneos concurrentes (pistola de código) pueden duplicar fulfillments en Medusa. La sesión se marca `completed` antes de que el fulfillment de Medusa tenga éxito; si falla, queda "completada" sin fulfillment. → `findOneAndUpdate` con `$inc` y guardas de estado. |
| A10 | varios admin pages (`auditoria`, `historial`, `usuarios`) | Auth de admin **solo en cliente** (`setIsAuthenticated(true)`); los endpoints no reciben token admin. Si la API no está protegida aparte, cualquiera la pega directo; si lo está, el gate de PIN es cosmético. |

---

## 🟡 MEDIO (deuda técnica — la causa del "siento que tiene muchos errores")

- **Hardcodeo de config dispersa:**
  - URL del backend `https://backend.marcelakoury.com` como fallback en `lib/medusa.ts:1` y en cliente `pedido/[id]/page.tsx:482`. Si falta la env, habla con prod en silencio.
  - 6 IDs de envío `so_01KFH...` hardcodeados en `lib/shipping.ts:3-8`. Específicos del entorno; rompen mudo en staging u otro tenant.
  - Nombres de actor hardcodeados en audit logs: `'Gestión'`, `'Admin'` (`gestion/deliver:60`, `api-keys:51`). La traza nunca dice quién fue realmente.
- **Lógica de clasificación duplicada y divergente:** `gestion/route.ts` clasifica pedidos por **substring del nombre** del método (`'retiro'`, `'tienda'`, `'express'`), mientras `ship` y `stats/orders` usan el **ID de opción** (`isStorePickup()`). Los dos discrepan al renombrar un método. Dentro de `gestion/route.ts` el conteo y la lista se calculan dos veces con criterios distintos → counts y lista pueden no coincidir.
- **Etiqueta de tienda duplicada:** todo el HTML/CSS de la etiqueta Zebra está duplicado entre `gestion/page.tsx:623` (`printStoreLabel`) y `StoreLabel.tsx:56`. Dos fuentes de verdad.
- **`formatWhatsAppNumber` copiado 4 veces**; mensaje de voucher de WhatsApp 3 veces; hook de audio/vibración (`useScanFeedback`) copy-paste en 4 archivos.
- **Voucher parseado de texto libre:** `gestion/page.tsx:664` saca código y valor de `faltanteNotes` con regex. Cualquier cambio de wording rompe la UI. → devolver campos estructurados de la API.
- **Archivos gigantes:** `PickingInterface.tsx` (1237 líneas), `gestion/page.tsx` (1219), `pedido/[id]/page.tsx` (669) — concentran casi toda la duplicación.
- **Catch genéricos sin log** en varias rutas (`auth`, `admin-auth`, `users/[userId]`) → imposible debuggear en prod.
- **CORS default `*`** en `middleware.ts:5` para endpoints autenticados y mutantes.
- **Rate limit en memoria** (`rate-limit.ts`): se resetea en cada deploy y es por-instancia; inútil en serverless/multi-instancia.
- **Sin validación de bodies** (`req.json()` directo en todos lados) ni de fechas en `stats/*` (`new Date(param)` → `Invalid Date` sin 400).

---

## 🟢 BAJO

- `<img>` crudo en vez de `next/image` (varios). `window.location.reload()` en vez de `router.refresh()` (`PrintButton`, `DeliverButton`).
- `confirm()`/`alert()` nativos mezclados con modales custom. AudioContext nunca se `close()`a (leak).
- `OrderTabs.tsx` y `RefreshButton.tsx` parecen **código muerto** (la home redirige a `/gestion` que usa otro sistema de tabs).
- Acentos inconsistentes en strings ("conexion"/"conexión", "Auditoria", "Metricas").
- `seguridad/page.tsx:97`: PIN de ejemplo `'841927'` en una tabla de config del cliente — es un *placeholder*, pero conviene usar uno obviamente falso.
- `userScalable: false` (`layout.tsx:29`) desactiva pinch-zoom (accesibilidad).
- Casts `any`/`Record<string, any>` que ocultan bugs de forma (como A8).

---

## Plan de remediación sugerido (por fases, sin reescribir)

**Fase 0 — Incendio (horas):**
C1 (rotar password Medusa + borrar `test-api.js` del historial), C6 (borrar log de PIN).

**Fase 1 — Auth/seguridad (3-5 días):**
C2, C3, C4, C5, C7, A1, A2, A3, A4, A5, A6.
Centralizar: un helper `getSession(req)` que devuelva `{userId, role}` desde el token, y un guard `requireRole('admin')`. Quitar todos los `userId` del body. Fallar al arrancar si faltan secretos.

**Fase 2 — Integridad de datos (3-4 días):**
A7, A8, A9. Hacer atómicos los flujos de pick/receive/complete/voucher con `findOneAndUpdate`+`$inc`+guardas de estado e idempotencia.

**Fase 3 — Config y deuda (4-6 días):**
Mover URL/IDs de envío/secretos a `lib/config.ts` validado. Unificar clasificación de pedidos en `lib/shipping.ts`. Extraer `buildStoreLabelHtml()`, `formatWhatsAppNumber`, `useAudioFeedback`, `serializeSession()`. Validación de bodies (zod). Borrar código muerto.

**Fase 4 — Pulido (2-3 días):**
CORS allowlist, rate-limit con store compartido, logging consistente, `next/image`, navegación con router, accesibilidad.

---

## Cosas que están BIEN (no tocar)

- El patrón de cookie httpOnly + HMAC del flujo `picking/login` es correcto (replicarlo en tienda).
- Modelos de Mongoose razonables, con `timestamps` e índices.
- Cache de conexión a Mongo correcta para hot-reload de Next.
- Escapado HTML (`escapeHtml`) presente y correcto en las etiquetas impresas.
- El cache de órdenes en memoria con `fetchingPromise` (dedupe de requests concurrentes) está bien pensado.
