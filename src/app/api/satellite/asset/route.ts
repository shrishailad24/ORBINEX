import { NextResponse } from 'next/server';
import { isAllowedSatelliteUrl } from '@/lib/satellite/security';
import { processSatelliteAsset } from '@/lib/satellite/image-processor';

export const maxDuration = 30;

function isJp2Buffer(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  // ISO 15444-1 JP2 Box
  if (
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x00 &&
    buf[3] === 0x0c &&
    buf[4] === 0x6a &&
    buf[5] === 0x50 &&
    buf[6] === 0x20 &&
    buf[7] === 0x20
  ) {
    return true;
  }
  // J2K Codestream Header
  if (buf[0] === 0xff && buf[1] === 0x4f && buf[2] === 0xff && buf[3] === 0x51) {
    return true;
  }
  return false;
}

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
    // 1. If the asset URL is a JPEG 2000 (.jp2) file, browsers cannot render it natively.
    // Transcode directly through the ORBINEX Python Raster Engine into a browser-standard PNG.
    const isJp2Url = targetUrl.toLowerCase().includes('.jp2');
    if (isJp2Url) {
      try {
        const processed = await processSatelliteAsset({
          inputUrl: targetUrl,
          stretch: false,
          platform: 'Sentinel-2',
        });
        return new NextResponse(processed.imageBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(processed.imageBuffer.length),
            'Cache-Control': 'public, s-maxage=2592000, max-age=604800, stale-while-revalidate=2592000',
            'X-Transcoded-From': 'JPEG-2000',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (transcodeErr: any) {
        console.warn('[ORBINEX] Direct JP2 transcode fallback to fetch:', transcodeErr.message);
      }
    }

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

    const buffer = Buffer.from(await upstreamRes.arrayBuffer());

    // 2. Check binary magic bytes in case a .jp2 was served with a misleading content-type
    if (isJp2Buffer(buffer)) {
      try {
        const processed = await processSatelliteAsset({
          inputUrl: targetUrl,
          stretch: false,
          platform: 'Sentinel-2',
        });
        return new NextResponse(processed.imageBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(processed.imageBuffer.length),
            'Cache-Control': 'public, s-maxage=2592000, max-age=604800, stale-while-revalidate=2592000',
            'X-Transcoded-From': 'JPEG-2000',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (transcodeErr: any) {
        console.warn('[ORBINEX] Magic-byte JP2 transcode failed:', transcodeErr.message);
      }
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, s-maxage=2592000, max-age=604800, stale-while-revalidate=2592000',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.warn('[ORBINEX] Satellite asset proxy error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to fetch satellite asset' }, { status: 502 });
  }
}
