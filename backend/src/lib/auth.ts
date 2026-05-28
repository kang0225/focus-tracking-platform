import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as sessionsRepo from '@/db/repositories/sessions';
import type { UserRow } from '@/db/schema/users';

/**
 * 세션 인증 모듈.
 *
 * 쿠키 형식:
 *   focus_session = base64url({ sid: "<rawToken>", exp: <ms> }).<HMAC-SHA256>
 *
 * - 평문 쿠키 토큰은 sessions 테이블 token_hash 의 raw 입력값 (DB 엔 sha256 만)
 * - 미들웨어(Edge runtime) 는 서명 검증 + exp 만 체크 (DB 안 봄)
 * - 라우트는 getSession() 으로 sessions 테이블까지 lookup → revoke 즉시 반영
 */

export interface AuthUser {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
  email: string | null;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number;
}

export const SESSION_COOKIE = 'focus_session';
export const STATE_COOKIE = 'focus_oauth_state';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const textEncoder = new TextEncoder();

const base64UrlEncode = (input: string | Buffer) => (
  Buffer.from(input).toString('base64url')
);

const base64UrlDecode = (input: string) => (
  Buffer.from(input, 'base64url').toString('utf8')
);

const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET must be set to at least 16 characters.');
  }
  return secret;
};

const sign = (payload: string) => (
  createHmac('sha256', getAuthSecret()).update(payload).digest('base64url')
);

const isLocalHostname = (hostname: string) => (
  hostname === 'localhost' || hostname === '127.0.0.1'
);

export const makeOauthState = () => randomBytes(24).toString('base64url');

export const getRequestOrigin = (request: Request) => {
  const appUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return new URL(appUrl).origin;
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto ?? 'https'}://${forwardedHost}`;
  }

  const host = request.headers.get('host')?.trim();
  if (host) {
    const hostname = host.split(':')[0];
    const protocol = isLocalHostname(hostname) ? 'http' : (forwardedProto ?? 'https');
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
};

export const getGoogleRedirectUri = (request: Request) => {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    const requestOrigin = getRequestOrigin(request);
    const requestHost = new URL(requestOrigin).hostname;
    const configuredHost = new URL(configured).hostname;

    if (!(isLocalHostname(configuredHost) && !isLocalHostname(requestHost))) {
      return configured;
    }
  }

  return new URL('/api/auth/callback', getRequestOrigin(request)).toString();
};

/**
 * sid + exp 를 HMAC 으로 서명해 쿠키에 넣을 토큰 문자열 생성.
 * Edge runtime 에서도 서명 검증만으로 통과시킬 수 있음.
 */
export const createSessionToken = (input: { sid: string; expiresAt: number }) => {
  const payload = base64UrlEncode(JSON.stringify({ sid: input.sid, exp: input.expiresAt }));
  return `${payload}.${sign(payload)}`;
};

interface TokenClaims {
  sid: string;
  expiresAt: number;
}

/**
 * 서명 검증만 수행. sessions 테이블 lookup 없음 (Edge 호환).
 * 라우트에서 실제 revocation 까지 검증하려면 resolveSession() 호출.
 */
export const verifySessionToken = (token?: string): TokenClaims | null => {
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = textEncoder.encode(signature);
  const expectedBuffer = textEncoder.encode(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { sid?: string; exp?: number };
    if (typeof decoded.sid !== 'string' || typeof decoded.exp !== 'number') return null;
    if (decoded.exp <= Date.now()) return null;
    return { sid: decoded.sid, expiresAt: decoded.exp };
  } catch {
    return null;
  }
};

const toAuthUser = (row: UserRow): AuthUser => ({
  id: row.id,
  login: row.email ?? row.googleSub,
  name: row.name,
  avatarUrl: row.avatarUrl ?? '',
  email: row.email,
});

/**
 * 라우트에서 사용. 쿠키 → 토큰 검증 → sessions 테이블 lookup → user 반환.
 * sessions.resolveSession 은 revoked_at IS NULL + expires_at > now 까지 체크.
 */
export const getSession = async (): Promise<AuthSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const claims = verifySessionToken(token);
  if (!claims) return null;

  const resolved = await sessionsRepo.resolveSession(claims.sid);
  if (!resolved) return null;

  return {
    user: toAuthUser(resolved.user),
    expiresAt: claims.expiresAt,
  };
};
