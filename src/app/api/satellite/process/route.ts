import { NextResponse } from 'next/server';
import { isAllowedSatelliteUrl, validateBbox } from '@/lib/satellite/security';
import { processSatelliteAsset } from '@/lib/satellite/image-processor';
import type { SatellitePlatform } from '@/lib/satellite/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return NextResponse.json(
      { error: 'Missing required "url" query parameter' },
      { status: 400 }
    );
  }

  // 1. SSRF & Origin Validation
  if (!isAllowedSatelliteUrl(rawUrl)) {
    return NextResponse.json(
      { error: 'Forbidden: Target asset URL is not from an authorized satellite data provider' },
      { status: 403 }
    );
  }

  // 2. Parse BBoxes
  const sceneBboxParam = searchParams.get('sceneBbox');
  const aoiBboxParam = searchParams.get('aoiBbox');

  let sceneBbox: [number, number, number, number] | null = null;
  let aoiBbox: [number, number, number, number] | null = null;

  if (sceneBboxParam) {
    const parts = sceneBboxParam.split(',').map((p) => parseFloat(p.trim()));
    sceneBbox = validateBbox(parts);
  }
  if (aoiBboxParam) {
    const parts = aoiBboxParam.split(',').map((p) => parseFloat(p.trim()));
    aoiBbox = validateBbox(parts);
  }

  const format = searchParams.get('format') || 'image';
  const stretch = searchParams.get('stretch') !== 'false';
  const platform = (searchParams.get('platform') as SatellitePlatform) || 'Sentinel-2';
  const targetWidth = Math.max(64, Math.min(2048, parseInt(searchParams.get('width') || '768', 10)));

  try {
    const result = await processSatelliteAsset({
      inputUrl: rawUrl,
      sceneBbox,
      aoiBbox,
      stretch,
      platform,
      targetWidth,
    });

    if (format === 'json') {
      const base64Preview = `data:image/png;base64,${result.imageBuffer.toString('base64')}`;
      return NextResponse.json({
        status: 'success',
        metadata: result.metadata,
        cacheHit: result.cacheHit,
        previewUrl: base64Preview,
      });
    }

    // Binary Image Stream
    return new NextResponse(result.imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(result.imageBuffer.length),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Satellite-Platform': result.metadata.platform,
        'X-Geospatial-CRS': result.metadata.crs,
        'X-Attribution': result.metadata.attribution,
        'X-ORBINEX-Cache': result.cacheHit ? 'HIT' : 'MISS',
      },
    });
  } catch (err: any) {
    console.error('[ORBINEX] Satellite processing error:', err.message);
    return NextResponse.json(
      {
        error: 'Failed to process satellite imagery asset',
        details: err.message,
      },
      { status: 500 }
    );
  }
}
