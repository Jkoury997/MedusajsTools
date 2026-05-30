'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-12.728 0a9 9 0 010-12.728m9.9 2.829a5 5 0 010 7.07m-7.07 0a5 5 0 010-7.07M12 12h.01M3 3l18 18" />
        </svg>
      </div>
      <div>
        <h1 className="text-lg font-bold text-gray-900">Sin conexión</h1>
        <p className="text-sm text-gray-500 mt-1">
          No hay internet en este momento. Las pantallas que ya abriste siguen
          disponibles; las acciones (escanear, enviar) se reanudan al volver la señal.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold active:opacity-90"
      >
        Reintentar
      </button>
    </div>
  );
}
