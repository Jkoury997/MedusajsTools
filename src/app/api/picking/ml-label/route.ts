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
      throw new HttpError(upstream.status === 401 ? 502 : upstream.status, message);
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
