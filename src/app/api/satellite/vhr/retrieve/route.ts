import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateCommercialAssetAuthorization } from '@/lib/satellite/vhr-safety';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('providerId') || '';
  const assetUrl = searchParams.get('assetUrl') || '';
  const sceneId = searchParams.get('sceneId') || '';

  if (!providerId) {
    return NextResponse.json(
      { error: 'Missing required parameter: providerId' },
      { status: 400 }
    );
  }

  // 1. Verify provider authentication and SSRF safety boundaries
  const authCheck = validateCommercialAssetAuthorization(providerId, assetUrl || undefined);
  if (!authCheck.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: authCheck.error,
        configuredEnvVar: authCheck.configuredEnvVar,
        accessStatus: 'unauthorized',
      },
      { status: authCheck.statusCode }
    );
  }

  // If no specific asset URL was supplied, return verified authorization status
  if (!assetUrl) {
    return NextResponse.json({
      success: true,
      providerId,
      sceneId,
      accessStatus: 'ready_to_download',
      message: `Authentication verified for ${providerId}. Ready to stream authorized raster assets.`,
      configuredEnvVar: authCheck.configuredEnvVar,
    });
  }

  // 2. Authorized server-side raster retrieval
  try {
    const fetchHeaders: Record<string, string> = {};
    if (providerId.includes('airbus') && process.env.AIRBUS_API_KEY) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.AIRBUS_API_KEY}`;
    } else if (providerId.includes('planet') && process.env.PLANET_API_KEY) {
      fetchHeaders['Authorization'] = `api-key ${process.env.PLANET_API_KEY}`;
    } else if (providerId.includes('maxar') && process.env.MAXAR_API_TOKEN) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.MAXAR_API_TOKEN}`;
    }

    const res = await fetch(assetUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Upstream satellite provider responded with HTTP ${res.status}: ${res.statusText}`,
          accessStatus: 'unavailable',
        },
        { status: res.status }
      );
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const contentLength = res.headers.get('content-length');

    // 500 MB max size safety check
    if (contentLength && parseInt(contentLength, 10) > 500 * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: 'Commercial raster exceeds maximum safe download threshold (500 MB).',
          accessStatus: 'unavailable',
        },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return NextResponse.json({
      success: true,
      providerId,
      sceneId,
      contentType,
      sizeBytes: buffer.length,
      checksumSha256: hash,
      accessStatus: 'ready_to_download',
      message: 'Authorized raster asset successfully validated and retrieved.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Raster download failed',
        accessStatus: 'error',
      },
      { status: 502 }
    );
  }
}
