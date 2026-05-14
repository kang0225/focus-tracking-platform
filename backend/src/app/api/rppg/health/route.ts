import { NextResponse } from 'next/server';
import { checkRppgRuntime } from '@/lib/facephys/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await checkRppgRuntime();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FacePhys rPPG runtime health check failed';
    console.error('[FacePhys rPPG] health check failed:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
