import { NextResponse } from 'next/server';
import { searchSatelliteScenes } from '@/lib/satellite/stac-client';
import { type SatellitePlatform } from '@/lib/satellite/types';

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

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: 'Valid lat and lng query parameters are required' },
        { status: 400 }
      );
    }

    const scenes = await searchSatelliteScenes({
      lat,
      lng,
      radiusKm,
      targetDate,
      startDate,
      endDate,
      platform,
      maxCloudCover,
      limit,
    });

    return NextResponse.json({
      success: true,
      query: { lat, lng, radiusKm, targetDate, platform, maxCloudCover },
      count: scenes.length,
      scenes,
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
