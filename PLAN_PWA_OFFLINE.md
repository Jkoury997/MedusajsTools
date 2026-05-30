# Plan — PWA + Lectura offline (Nivel 2) · pickup-system

**Repo:** `Jkoury997/MedusajsTools` · **Rama:** `claude/affectionate-wright-vA7D4`
**Objetivo:** que la app de pickeo se **instale como app**, **cargue y se pueda leer sin internet**, muestre un **badge Online/Offline** y **avise cuando hay una actualización**. Pensado para un depósito con señal inestable.

---

## Alcance (Nivel 2)

✅ Incluye:
- Instalable (PWA): ícono en pantalla de inicio, abre en pantalla completa.
- **Carga sin internet** (no queda en blanco): se sirve el "shell" de la app desde caché.
- **Lectura offline**: ver la lista de `/gestion` y los pedidos **ya abiertos** aunque se corte el internet (con datos de la última vez que hubo señal).
- **Badge Online/Offline** siempre visible.
- **Aviso de actualización**: cuando se publica una versión nueva, aparece un botón "Actualizar".

❌ NO incluye (sería Nivel 3):
- Escanear/confirmar/pickear **sin** internet. Con la señal caída, las acciones de escritura (pick, completar, faltantes, enviar) muestran un error claro y se reintentan cuando vuelve la señal — pero **no** se encolan localmente.

---

## Decisión técnica

**Service worker hecho a mano** (Cache API nativa), sin `next-pwa` ni `serwist`.
Motivo: Next 16 y React 19 son muy nuevos; las libs de PWA suelen ir atrás en compatibilidad. Un SW propio es ~100 líneas, sin dependencias y bajo nuestro control total.

---

## Cambios (archivos)

1. **`public/manifest.webmanifest`** — nombre, colores (`#ff75a8`), `display: standalone`, íconos.
2. **`public/icons/`** — `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (tiles de color de marca; se reemplazan por el logo real cuando quieras).
3. **`public/sw.js`** — service worker:
   - Precache del shell + página `/offline`.
   - **Estáticos** (`/_next/static/*`, fuentes, íconos): *cache-first*.
   - **Navegaciones** (`/gestion`, `/pedido/*`): *network-first* con fallback a caché → las páginas visitadas se reabren offline; las nunca visitadas muestran `/offline`.
   - **GET de API** (`/api/gestion`, etc.): *network-first* con fallback a caché → muestra los últimos datos offline.
   - **Mutaciones** (POST/PUT/DELETE): nunca se cachean; offline fallan con error claro.
   - Caché versionada + `skipWaiting`/`clients.claim` para actualizaciones.
   - Limpieza de caché al cerrar sesión (no dejar PII de otra sesión).
4. **`src/app/offline/page.tsx`** — pantalla simple "Sin conexión / reintentar".
5. **`src/components/PwaProvider.tsx`** (client) — registra el SW y detecta updates.
6. **`src/components/ConnectionBadge.tsx`** (client) — badge Online/Offline (`navigator.onLine` + eventos `online`/`offline`).
7. **`src/components/UpdateToast.tsx`** — botón "Actualizar" cuando hay versión nueva.
8. **`src/app/layout.tsx`** — link al manifest + íconos, y montar `PwaProvider` + `ConnectionBadge` + `UpdateToast`.

---

## Comportamiento offline por pantalla

| Pantalla | Online | Offline |
|----------|--------|---------|
| `/gestion` (lista) | normal | muestra la última lista cacheada + badge "Offline" |
| `/pedido/[id]` ya visitado | normal | se reabre desde caché (solo lectura) |
| `/pedido/[id]` nunca visitado | normal | pantalla `/offline` |
| Acciones de escritura (pick, enviar, etc.) | normal | error claro "sin conexión", reintentar al volver |

---

## Riesgos / notas
- SW requiere **HTTPS** (Vercel ✓). En dev funciona en `localhost`.
- Las respuestas de API con datos de clientes quedan en la **Cache Storage del dispositivo** (igual que hoy en memoria). Se **limpia al cerrar sesión** para no filtrar PII.
- El detalle de pedido es server component: offline solo sirve lo **ya visitado** (limitación esperada del Nivel 2).
- No toca la lógica de negocio ni el backend de Medusa: es 100% del lado del cliente del picking.

## Verificación
- `npm run build` + `lint`.
- Prueba manual: instalar PWA, cargar `/gestion`, abrir un pedido, cortar red (DevTools → Offline) y verificar que la lista y ese pedido siguen visibles + badge en "Offline" + recarga sin quedar en blanco.
