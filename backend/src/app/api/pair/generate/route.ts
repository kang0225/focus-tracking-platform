// src/app/api/pair/generate/route.ts
import { NextResponse } from 'next/server';
import { pairingCodes } from '@/lib/db'; 
export async function GET() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pairingCodes.set(code, {
    status: 'waiting',
    heartRate: 0,
    updatedAt: Date.now()
  });
  return NextResponse.json({ pairingCode: code });
}