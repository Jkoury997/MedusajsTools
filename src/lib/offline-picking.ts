/**
 * Estado de pickeo offline (Nivel 3).
 *
 * Mientras no hay señal, el pickeo se acumula en IndexedDB con CANTIDADES
 * ABSOLUTAS por item. Al volver la conexión, se reconcilia con el server vía
 * POST /api/picking/session/:orderId/sync (idempotente). Los reducers replican
 * la misma aritmética que hace el backend, para que la UI offline coincida.
 */

export interface LocalItem {
  lineItemId: string;
  quantityRequired: number;
  quantityPicked: number;
  quantityMissing?: number;
  barcode?: string;
  sku?: string;
}

export interface LocalSession {
  items: LocalItem[];
  totalRequired: number;
  totalPicked: number;
  totalMissing: number;
  isComplete: boolean;
  progressPercent: number;
}

export interface LocalRecord<S extends LocalSession = LocalSession> {
  orderId: string;
  session: S;
  /** Hay cambios locales no sincronizados con el server. */
  dirty: boolean;
  /** El operario tocó "completar" sin señal; completar al sincronizar. */
  pendingComplete: boolean;
  updatedAt: number;
}

// ──────────────────────────────────────────────────────────────────
// Reducers puros (misma lógica que el backend)
// ──────────────────────────────────────────────────────────────────

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Recalcula los totales/derivados. Devuelve un parcial para mergear sobre la
 * sesión del componente (preserva con runtime-spread los campos extra de items).
 */
export function recompute(items: LocalItem[]): LocalSession {
  const totalRequired = items.reduce((s, i) => s + i.quantityRequired, 0);
  const totalPicked = items.reduce((s, i) => s + i.quantityPicked, 0);
  const totalMissing = items.reduce((s, i) => s + (i.quantityMissing || 0), 0);
  const isComplete = items.every(
    (i) => i.quantityPicked + (i.quantityMissing || 0) >= i.quantityRequired,
  );

  return {
    items,
    totalRequired,
    totalPicked,
    totalMissing,
    isComplete,
    progressPercent:
      totalRequired > 0 ? Math.round(((totalPicked + totalMissing) / totalRequired) * 100) : 0,
  };
}

/** Suma `delta` (+1 / -1) a lo pickeado de un item, con clamp. Devuelve parcial de sesión. */
export function applyPickDelta(session: LocalSession, lineItemId: string, delta: number): LocalSession {
  const items = session.items.map((i) => {
    if (i.lineItemId !== lineItemId) return i;
    const quantityPicked = clamp(i.quantityPicked + delta, 0, i.quantityRequired);
    // Si vuelve a haber lugar, recortar faltantes que excedan.
    const quantityMissing = clamp(i.quantityMissing || 0, 0, Math.max(0, i.quantityRequired - quantityPicked));
    return { ...i, quantityPicked, quantityMissing };
  });
  return recompute(items);
}

/** Marca `quantity` faltantes (absoluto) sobre lo que falta pickear. Devuelve parcial de sesión. */
export function applyMissing(session: LocalSession, lineItemId: string, quantity: number): LocalSession {
  const items = session.items.map((i) => {
    if (i.lineItemId !== lineItemId) return i;
    const quantityMissing = clamp(quantity, 0, Math.max(0, i.quantityRequired - i.quantityPicked));
    return { ...i, quantityMissing };
  });
  return recompute(items);
}

/** Busca el item por código de barras (para el escaneo offline). */
export function findByBarcode(session: LocalSession, barcode: string): LocalItem | undefined {
  return session.items.find((i) => i.barcode === barcode);
}

/** Payload absoluto para el endpoint /sync. */
export function toSyncItems(session: LocalSession) {
  return session.items.map((i) => ({
    lineItemId: i.lineItemId,
    quantityPicked: i.quantityPicked,
    quantityMissing: i.quantityMissing || 0,
  }));
}

// ──────────────────────────────────────────────────────────────────
// Persistencia (IndexedDB)
// ──────────────────────────────────────────────────────────────────

const DB_NAME = 'mk-picking';
const STORE = 'sessions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'orderId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadLocal<S extends LocalSession = LocalSession>(
  orderId: string,
): Promise<LocalRecord<S> | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(orderId);
      req.onsuccess = () => resolve((req.result as LocalRecord<S>) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveLocal<S extends LocalSession>(record: LocalRecord<S>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...record, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort: si IndexedDB falla, la app sigue (sin persistencia offline)
  }
}

export async function clearLocal(orderId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(orderId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}
