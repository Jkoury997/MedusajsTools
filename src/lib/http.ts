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
 * - cualquier otro -> 500 genérico, con el detalle logueado en el servidor.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  console.error('[route] Error no manejado:', err);
  return NextResponse.json({ success: false, error: 'Error del servidor' }, { status: 500 });
}
