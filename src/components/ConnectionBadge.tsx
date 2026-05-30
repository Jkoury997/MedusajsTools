'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Badge fijo con el estado de conexión real (En línea / Sin conexión).
 *
 * Combina dos señales:
 *  - `navigator.onLine` + eventos online/offline (vía useSyncExternalStore).
 *  - Un heartbeat: pinguea /api/health cada 15s. Si el server no responde
 *    (aunque el SO diga "online"), el badge pasa a "Sin conexión". Más
 *    confiable que navigator.onLine solo (que a veces miente en WiFi del depósito).
 */
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

const PING_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS = 4_000;

export default function ConnectionBadge() {
  const osOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine, // cliente
    () => true, // SSR: asumimos online para no parpadear
  );
  // null = todavía sin medir; true/false = resultado del último ping.
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const ping = async () => {
      // Si el SO ya dice offline, no gastamos un fetch.
      if (!navigator.onLine) {
        if (active) setReachable(false);
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      try {
        const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
        if (active) setReachable(res.ok);
      } catch {
        if (active) setReachable(false);
      } finally {
        clearTimeout(timer);
      }
    };

    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    // Re-chequear al volver el foco o al recuperar conexión del SO.
    const onWake = () => ping();
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, []);

  // Online solo si el SO dice online Y el último ping respondió (o aún no midió).
  const online = osOnline && reachable !== false;

  return (
    <div
      className={`fixed bottom-3 left-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold shadow-lg print:hidden transition-colors ${
        online ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white'
      }`}
      role="status"
      aria-live="polite"
    >
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-300' : 'bg-red-400 animate-pulse'}`} />
      {online ? 'En línea' : 'Sin conexión'}
    </div>
  );
}
