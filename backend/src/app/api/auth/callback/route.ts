import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getGoogleRedirectUri,
  getRequestOrigin,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  STATE_COOKIE,
} from '@/lib/auth';
import * as usersRepo from '@/db/repositories/users';
import * as sessionsRepo from '@/db/repositories/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GoogleUserResponse {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const redirectWithError = (request: Request, error: string) => (
  NextResponse.redirect(new URL(`/login?error=${error}`, getRequestOrigin(request)))
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = request.headers.get('cookie')
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${STATE_COOKIE}=`))
    ?.split('=')[1];

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !process.env.AUTH_SECRET) {
    return redirectWithError(request, 'missing_config');
  }

  if (!code || !state || !storedState || state !== storedState) {
    return redirectWithError(request, 'invalid_state');
  }

  try {
    const redirectUri = getGoogleRedirectUri(request);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return redirectWithError(request, 'token_failed');

    const tokenData: { access_token?: string } = await tokenRes.json();
    if (!tokenData.access_token) return redirectWithError(request, 'token_failed');

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return redirectWithError(request, 'profile_failed');

    const googleUser: GoogleUserResponse = await userRes.json();
    const email = googleUser.email_verified === false ? null : googleUser.email ?? null;
    const displayName = googleUser.name || email || 'Google User';

    // 1) Postgres users 테이블에 upsert (google_sub 기준).
    const user = await usersRepo.upsertGoogleUser({
      googleSub: googleUser.sub,
      email,
      name: displayName,
      avatarUrl: googleUser.picture ?? null,
    });

    // 2) sessions 테이블에 신규 세션 행 + raw token 발급.
    const userAgent = request.headers.get('user-agent');
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip');
    const { rawToken } = await sessionsRepo.createSession({
      userId: user.id,
      userAgent,
      ip,
      ttlMs: SESSION_MAX_AGE_SECONDS * 1000,
    });

    // 3) sid 토큰 (HMAC 서명) 으로 쿠키 발급.
    const cookieToken = createSessionToken({
      sid: rawToken,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    });

    const response = NextResponse.redirect(new URL('/dashboard', getRequestOrigin(request)));
    response.cookies.delete(STATE_COOKIE);
    response.cookies.set(SESSION_COOKIE, cookieToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[auth/callback] failed:', err);
    return redirectWithError(request, 'oauth_failed');
  }
}
