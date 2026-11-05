'use client';

/**
 * Imprimir la ficha del pedido.
 *
 * Antes, en un pedido sin preparar, pedía el PIN para abrir una sesión de
 * picking por pedido. Ese armado está apagado (se prepara por Olas) y el
 * servidor respondía "El armado individual está deshabilitado": el botón no
 * imprimía nunca. Ahora imprime siempre, sin PIN.
 */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors print:hidden"
      aria-label="Imprimir"
    >
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
        />
      </svg>
    </button>
  );
}
