import { NextResponse } from 'next/server';
import { getPaidOrders } from '@/lib/medusa';

// GET /api/picking/orders-count - Obtener cantidad de pedidos para preparar
// Usa el caché de getPaidOrders si está disponible
export async function GET() {
  try {
    const response = await getPaidOrders(50, 0, 'preparar');
    return NextResponse.json({
      success: true,
      count: response.count,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, count: 0 },
      { status: 500 }
    );
  }
}
