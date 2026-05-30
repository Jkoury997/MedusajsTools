import { NextResponse } from 'next/server';

// GET /api/health — endpoint liviano para el heartbeat del badge de conexión.
// Público y sin tocar la base: solo confirma que el server responde.
export function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
