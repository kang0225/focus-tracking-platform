import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware (Edge runtime).
 *
 * 여기서는 쿠키의 sid 토큰 서명만 검증한다. pg/postgres 는 Edge 에서 못 쓰므로
 * sessions 테이블 lookup 은 각 라우트의 getSession() 에서 수행.
 *
 * 즉 이 미들웨어는 "쿠키 형식이 유효하고 만료 안 됐는가" 까지만 보장하고,
 * 사용자가 실제로 revoke 안 됐는지는 라우트가 책임짐.
 */

const SESSION_COOKIE = 'focus_session';
// 메인 페이지 ('/') 는 누구나 접근 가능 — 로그인 안 한 상태에서도 명예의 전당 등을
// 볼 수 있고, 측정/스터디룸 클릭 시 로그인으로 redirect.
const protectedPaths = ['/measure', '/result', '/room', '/tracker'];

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const bytesToBase64Url = (bytes: ArrayBuffer) => {
  const chars = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(chars).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const verifyToken = async (token?: string) => {
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
  const expected = bytesToBase64Url(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
  );
  if (expected !== signature) return false;

  try {
    // sid 토큰 형식: { sid: string, exp: number }
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as {
      sid?: string;
      exp?: number;
    };
    return typeof decoded.sid === 'string'
      && typeof decoded.exp === 'number'
      && decoded.exp > Date.now();
  } catch {
    return false;
  }
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const shouldProtect = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (!shouldProtect || pathname === '/login') {
    return NextResponse.next();
  }

  const hasValidToken = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasValidToken) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!api|_next|favicon.ico|opencv.js|heartbeat.js|webgazer.js|haarcascade_frontalface_alt.xml|.*\\.svg).*)',
  ],
};
