# Plan: Picking por olas (batch) con clasificación put-to-wall

> Objetivo: dejar de pickear **pedido por pedido** (ida y vuelta por cada orden) y
> pasar al modelo que usan los operadores logísticos grandes: **agarrar varios
> pedidos juntos, juntar toda la mercadería en una sola recorrida (consolidado por
> SKU) y después separarla en la mesa por pedido (put-to-wall) hasta dejar cada uno
> listo para enviar.**

Este plan **convive** con el flujo individual actual (`/api/picking/session/*`):
no se borra nada, se agrega un modo nuevo que se puede activar gradualmente.

---

## 1. Decisiones de diseño (acordadas)

| Tema | Decisión |
|------|----------|
| Recolección (paso 2) | **Consolidado por SKU**: el sistema suma las cantidades de cada SKU de toda la ola; el picker hace **una sola pasada** y junta el total. |
| Clasificación (paso 3) | **Put-to-wall**: mesa rectangular con **8 letras (A–H)**. Al escanear un ítem, el sistema indica **a qué letra** va. |
| Estaciones | **2 mesas en paralelo**, cada una con su propia ola activa. |
| Tamaño de ola | **Variable hasta 8 pedidos** (1 pedido = 1 letra). La mesa fija el máximo. |
| Armado de ola | **Sugerido + confirmación**: el sistema propone la mejor ola y el operador la ajusta y confirma. |
| Faltantes | **Automático por prioridad**: el más antiguo se sirve primero; el faltante cae en el de menor prioridad. |
| Cierre / envío | Cada letra queda **«lista para enviar»**; el fulfillment/etiqueta se dispara **aparte** (reutiliza el flujo de envío actual). |
| Alcance | **Conviven** los dos modos (individual + batch). |

---

## 2. Cómo funciona el flujo nuevo (vista de operador)

```
┌─────────────┐   sugerir+confirmar   ┌──────────────┐
│  PEDIDOS    │ ───────────────────▶  │   OLA (batch) │  hasta 8 pedidos → letras A..H
│  pendientes │                       │  estado: draft│
└─────────────┘                       └──────┬───────┘
                                             │ asignar a mesa (1 ó 2) + iniciar
                                             ▼
                                   ┌────────────────────┐
                                   │  RECOLECCIÓN        │  estado: picking
                                   │  consolidada x SKU  │  el picker escanea SKUs
                                   │  (una sola pasada)  │  hasta llegar al total
                                   └─────────┬──────────┘
                                             │ completar picking
                                             ▼
                                   ┌────────────────────┐
                                   │  MESA (put-to-wall) │  estado: sorting
                                   │  escanear cada ítem │  el sistema dice la LETRA
                                   │  → cae en su letra  │  (prioridad: + antiguo 1°)
                                   └─────────┬──────────┘
                                             │ cada letra completa → "lista"
                                             ▼
                                   ┌────────────────────┐
                                   │  LISTO PARA ENVIAR  │  estado: ready
                                   │  envío/etiqueta     │  se dispara aparte
                                   │  por el flujo actual│  (ship / store-label / ML)
                                   └────────────────────┘
```

---

## 3. Modelo de datos (nuevas entidades, no toca las actuales)

Se agregan a `src/lib/entities/` y al `index.ts`. Migración Mikro-ORM nueva
(`db:setup` / migración) — las tablas viejas no se modifican.

### `PickingWave` (la ola / batch)
- `id` (uuid)
- `displayNumber` (int autoincremental por tienda, para mostrar "Ola #12")
- `storeId` (string, index)
- `stationId` (string: `"mesa-1"` | `"mesa-2"`) — qué mesa la está procesando
- `status`: `draft` | `picking` | `sorting` | `ready` | `completed` | `cancelled`
- `createdByUserId`, `createdByName`
- timestamps: `createdAt`, `pickingStartedAt`, `sortingStartedAt`, `completedAt`, `cancelledAt`
- `cancelReason?`
- relaciones: `orders` (1:m `PickingWaveOrder`), `lines` (1:m `PickingWaveLine`)

### `PickingWaveOrder` (cada pedido dentro de la ola = una letra)
- `id`, `wave` (m:1)
- `orderId`, `orderDisplayId`
- `letter` (string `"A"`..`"H"`) — posición física en la mesa
- `priority` (int) — menor = más prioritario; se calcula por antigüedad del pedido
- `status`: `pending` | `sorting` | `ready`
- `readyAt?`
- relación: `items` (1:m `PickingWaveOrderItem`)

### `PickingWaveOrderItem` (lo que necesita cada pedido — destino del sorting)
- `id`, `waveOrder` (m:1)
- `lineItemId`, `variantId?`, `sku?`, `barcode?`
- `quantityRequired` (lo que pide el pedido)
- `quantitySorted` (default 0) — cuánto se clasificó a esta letra
- `quantityMissing` (default 0) — faltante final asignado a este pedido

### `PickingWaveLine` (vista consolidada por SKU — la recolección)
- `id`, `wave` (m:1)
- `variantId?`, `sku?`, `barcode?`, `title?`
- `quantityRequired` (= suma de `quantityRequired` de todos los pedidos para ese SKU)
- `quantityPicked` (default 0) — lo que el picker juntó en la recorrida
- `quantityShort` (default 0) — `required - picked` cuando se cierra el picking

> **Nota de prioridad / faltantes:** la asignación a letra y el reparto de faltantes
> se resuelven **en vivo durante el sorting** (ver §5), no hace falta precalcular un
> plan. Esto implementa "automático por prioridad" de forma natural.

---

## 4. API nueva (`/api/picking/waves/*`) — convive con `session/*`

Todas con `requireSession()` y las mismas reglas de tienda/rol que el flujo actual
(no-admin solo su tienda; admin cualquier tienda). Se reutiliza `getPaidOrders`,
`isStorePickup`, `errorResponse`, `audit`.

| Método | Endpoint | Qué hace |
|--------|----------|----------|
| `GET`  | `/api/picking/waves/suggest?storeId=&max=8` | Propone una ola: toma pedidos `enviar` (fulfilled) de retiro de la tienda, ordena por antigüedad, agrupa hasta 8. Devuelve la propuesta + el consolidado por SKU para revisar. |
| `POST` | `/api/picking/waves` | Crea la ola confirmada. Body: `{ storeId, orderIds[], stationId }`. Valida ≤ 8, asigna letras A.. por antigüedad, calcula `priority`, arma `PickingWaveLine` consolidadas. Estado `draft`. |
| `GET`  | `/api/picking/waves?storeId=&stationId=` | Lista olas activas (para retomar). |
| `GET`  | `/api/picking/waves/:id` | Detalle: consolidado (lines), pedidos+letras, progreso de picking y de sorting. |
| `POST` | `/api/picking/waves/:id/pick` | Escaneo durante recolección. Body: `{ barcode \| sku, qty=1 }`. Incrementa `quantityPicked` de la línea. Estado pasa a `picking` en el 1er scan. |
| `POST` | `/api/picking/waves/:id/pick/complete` | Cierra recolección: fija `quantityShort = required - picked` por línea, estado → `sorting`. |
| `POST` | `/api/picking/waves/:id/sort` | Escaneo en la mesa. Body: `{ barcode \| sku }`. Devuelve **la letra** + pedido destino (ver algoritmo §5). Incrementa `quantitySorted`. |
| `POST` | `/api/picking/waves/:id/orders/:orderId/ready` | Marca una letra lista (se llama solo automáticamente cuando se completa, o manual). |
| `POST` | `/api/picking/waves/:id/cancel` | Cancela la ola (libera la mesa). |

**Envío:** al quedar la ola en `ready`, cada pedido se despacha con el flujo que ya
existe (`/api/gestion/ship`, `store-label`, etiqueta ML). No se duplica esa lógica.

---

## 5. Algoritmo de sorting + faltantes (clave del diseño)

Al escanear un ítem en la mesa (`POST /sort` con un barcode/SKU):

1. Buscar en la ola los `PickingWaveOrderItem` de ese SKU que **todavía necesitan**
   unidades (`quantitySorted < quantityRequired`).
2. Elegir el de **mayor prioridad** (menor `priority` = pedido más antiguo).
3. `quantitySorted += 1` y devolver su **letra** (ej. `"C"`) para que el operador
   lo deposite ahí.
4. Si ese pedido completó todos sus ítems (`Σ sorted == Σ required`) → `status = ready`,
   `readyAt = now`.
5. Cuando la ola entera está clasificada, cualquier `PickingWaveOrderItem` con
   `quantitySorted < quantityRequired` → `quantityMissing = required - sorted`.
   Como se sirvió por prioridad, **el faltante cae solo en los de menor prioridad**.

> Esto da "automático por prioridad" sin precálculo: el más antiguo siempre se sirve
> primero y el último de la cola es el que se queda corto si faltó stock. El faltante
> resultante se puede enganchar con el flujo de **voucher/faltantes** que ya existe
> (`/api/gestion/faltantes`).

**Estaciones (2 mesas):** `stationId` en la ola garantiza que cada mesa tiene su ola.
Guarda de concurrencia: una mesa no puede tener 2 olas en estado `picking`/`sorting`
a la vez (validación al crear/iniciar).

---

## 6. UI (PWA, conviviendo con las pantallas actuales)

Nuevas rutas en `src/app` reutilizando componentes y hooks de escaneo existentes:

- **`/picking/olas`** — lista de olas activas por mesa + botón "Nueva ola".
- **`/picking/olas/nueva`** — pantalla de **sugerencia**: muestra los pedidos
  propuestos, el consolidado por SKU y permite sacar/agregar pedidos antes de
  **confirmar** y elegir mesa.
- **`/picking/olas/[id]/recoleccion`** — lista grande de SKUs con
  `pedido X de Y`, total a juntar, input de escaneo. Barra de progreso. Botón
  "Terminar recolección".
- **`/picking/olas/[id]/mesa`** — pantalla put-to-wall: input de escaneo y, al
  escanear, **una letra enorme A–H** + nombre del pedido. Grilla con las 8 letras
  y su progreso. Cada letra completa se marca "lista".

---

## 7. Plan de implementación por fases

> Cada fase es entregable y testeable por separado; el modo individual sigue
> funcionando todo el tiempo.

- **Fase 0 — Modelo + migración**
  Entidades nuevas + `index.ts` + migración. Sin UI. (Riesgo bajo, no toca lo viejo.)

- **Fase 1 — Armado de olas (sugerir + confirmar)**
  `GET /waves/suggest`, `POST /waves`, `GET /waves`, `GET /waves/:id` + pantallas
  `/olas` y `/olas/nueva`. Acá ya se ve el valor: agrupar pedidos.

- **Fase 2 — Recolección consolidada**
  `POST /waves/:id/pick` + `/pick/complete` + pantalla `recoleccion`.

- **Fase 3 — Mesa put-to-wall (sorting)**
  `POST /waves/:id/sort` + algoritmo de prioridad/faltantes + pantalla `mesa` +
  `orders/:orderId/ready`.

- **Fase 4 — Cierre y envío**
  Enganche con el flujo de envío/etiqueta existente al quedar `ready` +
  integración con faltantes/voucher.

- **Fase 5 — Operación 2 mesas + stats/auditoría**
  Guardas de concurrencia por `stationId`, auditoría (`audit`) en cada paso,
  métricas de la ola (tiempo de recolección vs sorting, ítems/hora).

- **Fase 6 — (opcional) Deprecación gradual**
  Si en producción el batch rinde, se evalúa deprecar el modo individual.

---

## 8. Riesgos y puntos a vigilar

- **Stock/reservas en Medusa:** el fulfillment ya tuvo el problema de "sin reserva"
  (ver `session/[orderId]/complete`). Como la ola crea fulfillments por pedido al
  final, reusar el mismo retry de reservas.
- **Cambios de pedido durante la ola:** si un pedido se cancela/modifica entre el
  armado y el sorting, la ola debe poder sacar esa letra sin romperse.
- **Identificación física de la mesa:** decidir cómo el operador elige "mesa 1 / 2"
  (login por dispositivo, selector, o QR pegado en cada mesa).
- **Escaneo de SKU repetido en varios pedidos:** el algoritmo de prioridad lo cubre,
  pero la UI tiene que dejar clarísima la letra para evitar errores de colocación.
```
