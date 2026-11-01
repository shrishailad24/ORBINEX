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
  const sceneId = searchParams.get('sceneId') || undefined;
  const datetime = searchParams.get('datetime') || undefined;

  // Handle WMTS tile template URLs with real temporal parameters (NASA GIBS)
  if (rawUrl.includes('{z}') || rawUrl.includes('{x}')) {
    if (rawUrl.includes('gibs.earthdata.nasa.gov')) {
      const targetBbox = aoiBbox || sceneBbox || [-180, -90, 180, 90];
      const [minLng, minLat, maxLng, maxLat] = targetBbox;
      const cLng = (minLng + maxLng) / 2;
      const cLat = (minLat + maxLat) / 2;
      const z = 9;
      const x = Math.floor(((cLng + 180) / 360) * Math.pow(2, z));
      const latRad = (cLat * Math.PI) / 180;
      const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z));
      const actualTileUrl = rawUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      const tileRes = await fetch(actualTileUrl);
      if (tileRes.ok) {
        const buf = Buffer.from(await tileRes.arrayBuffer());
        return new NextResponse(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(buf.length),
            'Cache-Control': 'public, max-age=86400',
            'X-Satellite-Platform': 'NASA-GIBS',
          },
        });
      }
    }

    return NextResponse.json(
      { error: 'Invalid or unresolved tile template. Authentic satellite observation required.' },
      { status: 400 }
    );
  }

  try {
    const result = await processSatelliteAsset({
      inputUrl: rawUrl,
      sceneBbox,
      aoiBbox,
      stretch,
      platform,
      targetWidth,
      sceneId,
      datetime,
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
    return new NextResponse(new Uint8Array(result.imageBuffer), {
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
