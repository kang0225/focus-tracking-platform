import { NextResponse } from 'next/server';
import { pairingCodes, setCurrentPairing } from '@/lib/db';
export async function POST(request: Request) {
  try {
    const body: { pairingCode: string; heartRate: number; appleWatchPaired?: boolean } = await request.json();
    const { pairingCode, heartRate, appleWatchPaired } = body;

    const session = pairingCodes.get(pairingCode);

    if (session) {
      pairingCodes.set(pairingCode, {
        ...session,
        heartRate,
        status: 'active',
        updatedAt: Date.now(),
        appleWatchPaired
      });
      setCurrentPairing(pairingCodes.get(pairingCode)!);
      console.log(`[TS-Backend] Code: ${pairingCode}, BPM: ${heartRate}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid Code' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
