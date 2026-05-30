'use client';

import { useSyncExternalStore } from 'react';

/**
 * Badge fijo con el estado de conexión (En línea / Sin conexión).
 * Usa useSyncExternalStore sobre navigator.onLine + eventos online/offline
 * (la forma recomendada por React para suscribirse a un estado externo, sin
 * setState dentro de un effect).
 */
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export default function ConnectionBadge() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine, // cliente
    () => true, // SSR: asumimos online para no parpadear
  );

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
