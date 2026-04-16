// src/app/api/pair/current/route.ts
import { NextResponse } from 'next/server';
import { getCurrentPairing } from '@/lib/db';

export async function GET() {
  const currentPairing = getCurrentPairing();
  if (currentPairing && currentPairing.status === 'active') {
    return NextResponse.json(currentPairing);
  }
  return NextResponse.json({ error: 'No active pairing' }, { status: 404 });
}