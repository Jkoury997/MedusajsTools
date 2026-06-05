import { NextResponse } from 'next/server';

/** Error con status HTTP. Lanzalo desde un handler y convertilo con errorResponse(). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Convierte un error en una NextResponse JSON consistente.
 * - HttpError -> su status + mensaje (seguro para el cliente).
 * - cualquier otro -> 500 con el mensaje real del error (más el detalle logueado
 *   en el servidor). Es una herramienta interna de depósito: mostrar la causa
 *   real ayuda a operar y depurar, y el riesgo de filtrar el mensaje es bajo.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  console.error('[route] Error no manejado:', err);
  const detail = err instanceof Error ? err.message : String(err);
  return NextResponse.json(
    { success: false, error: detail || 'Error del servidor', unexpected: true },
    { status: 500 },
  );
}
