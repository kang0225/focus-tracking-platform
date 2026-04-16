// src/app/api/pair/status/route.ts
import { NextResponse } from 'next/server';
import { pairingCodes } from '@/lib/db';
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 });

  const data = pairingCodes.get(code);
  if (data) {
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}