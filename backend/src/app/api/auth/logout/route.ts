import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import * as sessionsRepo from '@/db/repositories/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // 현재 세션을 DB 에서 revoke. 쿠키 만료시켜도 token_hash 가 살아있으면 위험.
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieToken = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split('=')[1];

  const claims = verifySessionToken(cookieToken);
  if (claims) {
    try {
      await sessionsRepo.revokeSession(claims.sid);
    } catch (err) {
      console.error('[auth/logout] revoke failed:', err);
      // revoke 실패해도 쿠키는 어쨌든 삭제.
    }
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
