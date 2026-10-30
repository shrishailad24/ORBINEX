import { NextResponse } from 'next/server';
import { isAllowedSatelliteUrl } from '@/lib/satellite/security';

export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Security & SSRF Protection: verify host is in allowed satellite domain list
  if (!isAllowedSatelliteUrl(targetUrl)) {
    return NextResponse.json({ error: 'Forbidden: host not in verified satellite allowlist' }, { status: 403 });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'ORBINEX-Satellite-Gateway/1.0',
        Accept: 'image/jpeg, image/png, image/webp, image/tiff, */*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { error: `Upstream error HTTP ${upstreamRes.status}` },
        { status: upstreamRes.status }
      );
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstreamRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, s-maxage=2592000, max-age=604800, stale-while-revalidate=2592000',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.warn('[ORBINEX] Satellite asset proxy error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to fetch satellite asset' }, { status: 502 });
  }
}
