'use client';

import { useEffect, useState } from 'react';
import ConnectionBadge from './ConnectionBadge';

/**
 * Registra el service worker y gestiona el flujo de actualización:
 * cuando se publica una versión nueva, el SW queda "waiting" y mostramos
 * un aviso para aplicarla (skipWaiting + reload).
 *
 * También monta el badge de conexión global.
 */
export default function PwaProvider() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let reloading = false;
    // Cuando el nuevo SW toma control, recargar una sola vez.
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Ya hay uno esperando (actualización pendiente).
        if (reg.waiting) setWaiting(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // Hay un controlador previo => es una actualización, no la primera instalación.
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(nw);
            }
          });
        });
      })
      .catch(() => {
        // Registro fallido (p. ej. http no-localhost): la app sigue funcionando normal.
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  function applyUpdate() {
    waiting?.postMessage('SKIP_WAITING');
    setWaiting(null);
  }

  return (
    <>
      <ConnectionBadge />
      {waiting && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-900 text-white shadow-lg">
          <span className="text-sm font-medium">Hay una actualización</span>
          <button
            onClick={applyUpdate}
            className="px-3 py-1 bg-brand-500 text-white rounded-lg text-sm font-bold active:opacity-90"
          >
            Actualizar
          </button>
        </div>
      )}
    </>
  );
}
