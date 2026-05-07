import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'focus_session';
const protectedPaths = ['/', '/dashboard', '/result', '/room', '/tracker'];

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const bytesToBase64Url = (bytes: ArrayBuffer) => {
  const chars = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(chars).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const verifySession = async (token?: string) => {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = bytesToBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  if (expected !== signature) return false;

  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { expiresAt?: number };
    return typeof session.expiresAt === 'number' && session.expiresAt > Date.now();
  } catch {
    return false;
  }
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const shouldProtect = protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!shouldProtect || pathname === '/login') {
    return NextResponse.next();
  }

  const hasSession = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|opencv.js|heartbeat.js|webgazer.js|haarcascade_frontalface_alt.xml|.*\\.svg).*)'],
};
