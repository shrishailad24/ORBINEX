import { NextResponse } from 'next/server';
import { searchSatelliteScenes } from '@/lib/satellite/stac-client';
import { type SatellitePlatform } from '@/lib/satellite/types';
import { satelliteRegistry } from '@/lib/satellite/providers';
import { pointToBbox } from '@/lib/satellite/security';

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lng = parseFloat(searchParams.get('lng') || '');
    const radiusKm = parseFloat(searchParams.get('radius') || '15');
    const targetDate = searchParams.get('targetDate') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const platform = (searchParams.get('platform') as SatellitePlatform) || 'Sentinel-2';
    const maxCloudCover = searchParams.has('maxCloud') ? parseFloat(searchParams.get('maxCloud')!) : 25;
    const limit = parseInt(searchParams.get('limit') || '10');
    const isMultiMode = searchParams.get('mode') === 'multi' || searchParams.get('multi') === 'true';

    const bboxParam = searchParams.get('bbox');
    const bbox: [number, number, number, number] | undefined = bboxParam
      ? (bboxParam.split(',').map(Number) as [number, number, number, number])
      : Number.isFinite(lat) && Number.isFinite(lng)
        ? pointToBbox(lat, lng, radiusKm)
        : undefined;

    if (!bbox && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      return NextResponse.json(
        { error: 'Valid lat/lng or bbox parameters are required' },
        { status: 400 }
      );
    }

    if (isMultiMode) {
      // Execute Unified Multi-Provider Discovery (AI-03)
      const multiResult = await satelliteRegistry.searchAll({
        lat,
        lng,
        bbox,
        radiusKm,
        targetDate,
        startDate,
        endDate,
        maxCloudCover,
        platform,
        limit,
      });

      return NextResponse.json({
        ...multiResult,
        // Backward compatibility mapping for components reading `scenes`
        scenes: multiResult.observations.map((obs) => ({
          id: obs.id,
          platform: obs.satellite,
          modality: obs.modality,
          collection: obs.productLevel,
          datetime: obs.acquisitionDate,
          cloudCover: obs.cloudCover,
          bbox: obs.bbox,
          thumbnailUrl: obs.thumbnailUrl,
          visualUrl: obs.visualUrl,
          metadata: {
            resolutionMeters: obs.gsdMeters,
            instrument: obs.sensor,
          },
        })),
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }

    // Default: Open STAC discovery with multi-provider metadata sidecar
    const scenes = await searchSatelliteScenes({
      lat,
      lng,
      bbox,
      radiusKm,
      targetDate,
      startDate,
      endDate,
      platform,
      maxCloudCover,
      limit,
    });

    const providers = await satelliteRegistry.listProviders();

    return NextResponse.json({
      success: true,
      query: { lat, lng, bbox, radiusKm, targetDate, platform, maxCloudCover },
      count: scenes.length,
      scenes,
      providers,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('[ORBINEX] Satellite search error:', error);
    return NextResponse.json(
      { error: 'Internal satellite search error', scenes: [] },
      { status: 500 }
    );
  }
}
