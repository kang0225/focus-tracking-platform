import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface IceServerConfig {
  urls?: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function isValidIceServer(value: unknown): value is IceServerConfig {
  if (!value || typeof value !== 'object') return false;
  const urls = (value as IceServerConfig).urls;
  return typeof urls === 'string' || Array.isArray(urls);
}

function parseIceServers() {
  const configured = process.env.RTC_ICE_SERVERS || process.env.NEXT_PUBLIC_RTC_ICE_SERVERS;
  if (!configured) return DEFAULT_ICE_SERVERS;

  try {
    const parsed = JSON.parse(configured) as IceServerConfig | IceServerConfig[];
    const servers = (Array.isArray(parsed) ? parsed : [parsed]).filter(isValidIceServer);
    return servers.length > 0 ? servers : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

export async function GET() {
  return NextResponse.json(
    {
      iceServers: parseIceServers(),
      iceCandidatePoolSize: 4,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
