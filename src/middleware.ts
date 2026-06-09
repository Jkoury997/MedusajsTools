import { NextRequest, NextResponse } from 'next/server';
import { config as appConfig } from '@/lib/config';

// Rutas de SOLO LECTURA accesibles por el dashboard externo con STATS_API_KEY.
// La API key solo se acepta en GET: cualquier mutación cae a requerir sesión.
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

// Rutas que aceptan Bearer token (tienda) o cookie de sesión (picker/admin).
const STORE_TOKEN_PATHS = [
  '/api/picking/deliver',
  '/api/picking/store-orders',
];

// Separación de capacidades por rol.
// Preparación (olas/gestión): la operan picker y ecommerce; el admin entra a todo.
// La tienda (store) NO prepara: solo recibe y marca entregado a la clienta.
const GESTION_PATHS = [
  '/gestion',
  '/olas',
  '/faltantes',
  '/despacho',
  '/api/gestion',
  '/api/picking/waves',
  '/api/picking/ml-label',
];
const GESTION_ROLES = new Set(['picker', 'ecommerce', 'admin']);

// Nota: la entrega a la clienta (/api/picking/deliver) la pueden hacer store,
// ecommerce y picker (este último SOLO retiro en fábrica). Esa distinción fina
// la valida el propio handler por rol + tipo de envío, no el middleware.

function isGestionPath(pathname: string): boolean {
  return GESTION_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Rutas públicas que no necesitan autenticación.
const PUBLIC_PATHS = [
  '/login',
  '/tienda',
  '/offline',
  '/api/picking/login',
  '/api/picking/auth',
  '/api/picking/store-auth',
  '/icon.svg',
  '/apple-icon.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/icons/',
];

// HMAC con Web Crypto API (funciona en Edge).
async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appConfig.sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Comparación en tiempo constante (evita timing oracle sobre la firma). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyToken(token: string): Promise<{ userId: string; role: string } | null> {
  try {
    const decoded = atob(token);
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, role, expiresStr, signature] = parts;
    const expires = parseInt(expiresStr, 10);
    if (!expires || Date.now() > expires) return null;
    const expectedSig = await hmacSign(`${userId}:${role}:${expiresStr}`);
    if (!constantTimeEqual(signature, expectedSig)) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

/** Resuelve el origin permitido para CORS según la allowlist (nunca '*'). */
function corsOriginFor(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  return appConfig.statsCorsOrigins.includes(origin) ? origin : null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Rutas públicas
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Estáticos de Next.js y recursos
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Endpoints de lectura para dashboard externo / admin interno.
  if (API_KEY_PATHS.some((p) => pathname.startsWith(p))) {
    const allowedOrigin = corsOriginFor(request);

    // CORS preflight
    if (method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'x-publishable-api-key, Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
      };
      if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
      return new NextResponse(null, { status: 200, headers });
    }

    // La STATS_API_KEY SOLO autoriza lecturas (GET). Las mutaciones requieren sesión.
    const apiKey = request.headers.get('x-publishable-api-key');
    if (method === 'GET' && apiKey && apiKey === appConfig.statsApiKey) {
      const response = NextResponse.next();
      if (allowedOrigin) response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      return response;
    }

    // Fallback: sesión activa (admin interno). El rol fino lo valida el handler.
    const sessionCookie = request.cookies.get('picking-session');
    if (sessionCookie?.value) {
      const session = await verifyToken(sessionCookie.value);
      if (session) {
        // La tienda no opera recursos de preparación (gestión/olas).
        if (isGestionPath(pathname) && !GESTION_ROLES.has(session.role)) {
          return NextResponse.json({ success: false, error: 'No autorizado para este recurso' }, { status: 403 });
        }
        const response = NextResponse.next();
        if (allowedOrigin) response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
        return response;
      }
    }

    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }

  // Endpoints de entrega/tienda: Bearer (tienda) o cookie (store/picker/ecommerce/admin).
  // El rol fino (p. ej. picker solo retiro en fábrica) lo valida el handler.
  if (STORE_TOKEN_PATHS.some((p) => pathname.startsWith(p))) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const session = await verifyToken(authHeader.slice(7));
      if (session) return NextResponse.next();
    }
    const sessionCookie = request.cookies.get('picking-session');
    if (sessionCookie?.value) {
      const session = await verifyToken(sessionCookie.value);
      if (session) return NextResponse.next();
    }
    return NextResponse.json({ success: false, error: 'Autenticacion requerida' }, { status: 401 });
  }

  // Resto: requiere cookie de sesión.
  const sessionCookie = request.cookies.get('picking-session');
  if (!sessionCookie?.value) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifyToken(sessionCookie.value);
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Sesion expirada' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set('picking-session', '', { maxAge: 0, path: '/' });
    return response;
  }

  // Proteger páginas admin (las APIs admin validan rol en el handler).
  if (pathname.startsWith('/admin') && session.role !== 'admin') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'admin');
    return NextResponse.redirect(loginUrl);
  }

  // Preparación (gestión/olas): la tienda no entra; se la manda a su flujo.
  if (isGestionPath(pathname) && !GESTION_ROLES.has(session.role)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'No autorizado para este recurso' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/tienda', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
