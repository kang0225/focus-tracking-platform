import { NextResponse } from 'next/server';
import * as pairingRepo from '@/db/repositories/pairing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 페어링 코드 상태 조회.
 *
 * Phone 쪽에서 (게스트 가능) 코드 입력 후 status 확인하는 용도이므로
 * 인증 강제 안 함. claim 되었는지만 알려주고, 발급자 정보는 노출 안 함.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code' }, { status: 400 });
  }

  const active = await pairingRepo.findActiveCode(code);
  if (!active) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({
    status: 'waiting' as const,
    heartRate: 0,
    updatedAt: active.createdAt.getTime(),
  });
}
