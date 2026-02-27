import { NextRequest, NextResponse } from 'next/server';

const SESSION_SECRET = process.env.SESSION_SECRET || 'pickup-secret-2024';
const STATS_API_KEY = process.env.STATS_API_KEY || '';
const STATS_CORS_ORIGIN = process.env.STATS_CORS_ORIGIN || '*';

// Prefijos que usan auth por API key (en vez de cookies)
// Incluye stats, admin, auditoría, usuarios, historial, tiendas y gestión
// para acceso desde dashboard externo
const API_KEY_PATHS = [
  '/api/stats/',
  '/api/admin/',
  '/api/picking/audit',
  '/api/picking/users',
  '/api/picking/history',
  '/api/picking/stores',
  '/api/picking/orders-count',
  '/api/gestion',
];

// Rutas que aceptan Bearer token (para usuarios tienda)
const STORE_TOKEN_PATHS = [
  '/api/picking/deliver',
  '/api/picking/store-orders',
];

// Rutas públicas que no necesitan autenticación
const PUBLIC_PATHS = [
  '/login',
  '/tienda',
  '/api/picking/login',
  '/api/picking/auth',
  '/api/picking/store-auth',
  '/icon.svg',
  '/apple-icon.svg',
  '/favicon.ico',
];

// HMAC con Web Crypto API (funciona en Edge)
async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyToken(token: string): Promise<{ userId: string; role: string } | null> {
  try {
    const decoded = atob(token);
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, role, expiresStr, signature] = parts;
    const expires = parseInt(expiresStr);
    if (Date.now() > expires) return null;
    const expectedSig = await hmacSign(`${userId}:${role}:${expiresStr}`);
    if (signature !== expectedSig) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Permitir archivos estáticos de Next.js y recursos
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // archivos con extensión (css, js, png, etc.)
  ) {
    return NextResponse.next();
  }

  // Auth por API key para endpoints de admin/stats/gestion (dashboard externo)
  if (API_KEY_PATHS.some(p => pathname.startsWith(p))) {
    // CORS preflight — no requiere API key
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': STATS_CORS_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'x-publishable-api-key, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const apiKey = request.headers.get('x-publishable-api-key');
    if (apiKey && STATS_API_KEY && apiKey === STATS_API_KEY) {
      // API key válida — pasar con CORS headers (dashboard externo)
      const response = NextResponse.next();
      response.headers.set('Access-Control-Allow-Origin', STATS_CORS_ORIGIN);
      return response;
    }

    // Fallback: permitir acceso con sesión activa (admin interno)
    const sessionCookie = request.cookies.get('picking-session');
    if (sessionCookie?.value) {
      const session = await verifyToken(sessionCookie.value);
      if (session) return NextResponse.next();
    }

    return NextResponse.json(
      { success: false, error: 'Invalid API key' },
      { status: 401 }
    );
  }

  // Auth por Bearer token O cookie para endpoints de tienda (deliver, store-orders)
  // Acepta Bearer token (tienda) o cookie de sesión (picker/admin)
  if (STORE_TOKEN_PATHS.some(p => pathname.startsWith(p))) {
    const authHeader = request.headers.get('authorization');
    const sessionCookie = request.cookies.get('picking-session');

    // Intentar Bearer token primero (tienda)
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const session = await verifyToken(token);
      if (session) return NextResponse.next();
    }

    // Fallback a cookie de sesión (picker/admin)
    if (sessionCookie?.value) {
      const session = await verifyToken(sessionCookie.value);
      if (session) return NextResponse.next();
    }

    return NextResponse.json(
      { success: false, error: 'Autenticacion requerida' },
      { status: 401 }
    );
  }

  // Verificar cookie de sesión
  const sessionCookie = request.cookies.get('picking-session');
  if (!sessionCookie?.value) {
    // Para rutas de API, devolver 401 en vez de redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifyToken(sessionCookie.value);
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Sesion expirada' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set('picking-session', '', { maxAge: 0, path: '/' });
    return response;
  }

  // Proteger rutas admin
  if (pathname.startsWith('/admin') && session.role !== 'admin') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'admin');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
};
