import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

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

export const makeOauthState = () => randomBytes(24).toString('base64url');

export const createSessionToken = (session: AuthSession) => {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
};

export const verifySessionToken = (token?: string): AuthSession | null => {
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = textEncoder.encode(signature);
  const expectedBuffer = textEncoder.encode(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as AuthSession;
    if (!session.user || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
};

export const getSession = async () => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
};
