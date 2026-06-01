import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { requireSession } from '@/lib/session';
import { errorResponse, HttpError } from '@/lib/http';

/**
 * GET /api/picking/ml-label?shipmentId=...  (o ?orderId=<medusa order id>)
 *
 * Proxy autenticado por sesión hacia Medusa (`/admin/mercadolibre/label`).
 * Mantiene la secret key de Medusa y el token de ML del lado servidor, y
 * streamea el PDF de la etiqueta de Mercado Envíos al operador.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();

    const shipmentId = req.nextUrl.searchParams.get('shipmentId')?.trim();
    const orderId = req.nextUrl.searchParams.get('orderId')?.trim();

    if (!shipmentId && !orderId) {
      throw new HttpError(400, 'Falta shipmentId u orderId');
    }

    const params = new URLSearchParams();
    if (shipmentId) params.set('shipment_id', shipmentId);
    else if (orderId) params.set('order_id', orderId);

    const basic = Buffer.from(`${config.medusaSecretApiKey}:`).toString('base64');
    const upstream = await fetch(
      `${config.medusaBackendUrl}/admin/mercadolibre/label?${params.toString()}`,
      {
        headers: { Authorization: `Basic ${basic}` },
        cache: 'no-store',
      },
    );

    if (!upstream.ok) {
      let message = 'No se pudo obtener la etiqueta de Mercado Envíos';
      try {
        const err = await upstream.json();
        if (err?.message) message = err.message;
      } catch {
        // upstream no devolvió JSON
      }

      // El botón abre esta ruta en una pestaña nueva, así que ante un error
      // devolvemos una página legible (no JSON crudo). El caso más común es que
      // el envío ya haya salido: Mercado Envíos solo entrega la etiqueta mientras
      // está en `ready_to_ship`; una vez `dropped_off`/`shipped`/`delivered` ya
      // no se puede reimprimir (y no hace falta: el paquete ya está en camino).
      return labelUnavailablePage(message);
    }

    const pdf = await upstream.arrayBuffer();

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="ml-etiqueta-${shipmentId || orderId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Página HTML legible (en vez de JSON crudo) para cuando la etiqueta no está
 * disponible. Se abre en la pestaña que lanzó el botón "Etiqueta ML".
 */
function labelUnavailablePage(rawMessage: string): NextResponse {
  const status = /status is (\w+)/i.exec(rawMessage)?.[1]?.toLowerCase();

  const SHIPPED = ['dropped_off', 'shipped', 'delivered', 'not_delivered', 'returned'];
  const NOT_READY = ['pending', 'handling', 'ready_to_print'];

  let emoji = '⚠️';
  let title = 'Etiqueta no disponible';
  let subtitle = 'No se pudo obtener la etiqueta de Mercado Envíos.';

  if (status && SHIPPED.includes(status)) {
    emoji = '📦';
    title = 'Envío ya despachado';
    subtitle =
      'Este pedido ya fue despachado por Mercado Envíos, así que la etiqueta ya no está disponible. El paquete está en camino — no hace falta reimprimirla.';
  } else if (status && NOT_READY.includes(status)) {
    emoji = '⏳';
    title = 'Envío todavía no listo';
    subtitle =
      'Mercado Envíos aún no generó la etiqueta para este pedido. Probá de nuevo en unos minutos.';
  }

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;
    padding:32px;text-align:center}
  .emoji{font-size:48px;line-height:1;margin-bottom:12px}
  h1{font-size:20px;margin:0 0 8px;color:#111827}
  p{font-size:14px;line-height:1.5;color:#4b5563;margin:0 0 20px}
  .status{font-size:12px;color:#9ca3af;margin-top:4px}
  button{background:#111827;color:#facc15;border:0;border-radius:10px;padding:12px 20px;font-size:14px;
    font-weight:700;cursor:pointer}
  button:hover{background:#1f2937}
</style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    ${status ? `<p class="status">Estado del envío en Mercado Envíos: <strong>${status}</strong></p>` : ''}
    <button onclick="window.close()">Cerrar</button>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
