import { NextRequest, NextResponse } from 'next/server';

const SESSION_SECRET = process.env.SESSION_SECRET || 'pickup-secret-2024';

// Rutas públicas que no necesitan autenticación
const PUBLIC_PATHS = [
  '/login',
  '/tienda',
  '/api/picking/login',
  '/api/picking/auth',
  '/api/picking/store-auth',
  '/api/picking/store-orders',
  '/api/picking/deliver',
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

  // Verificar cookie de sesión
  const sessionCookie = request.cookies.get('picking-session');
  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifyToken(sessionCookie.value);
  if (!session) {
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
