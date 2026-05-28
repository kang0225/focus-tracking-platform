import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import * as pairingRepo from '@/db/repositories/pairing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const created = await pairingRepo.issuePairingCode({
    issuerUserId: session.user.id,
  });

  return NextResponse.json({ pairingCode: created.code });
}
