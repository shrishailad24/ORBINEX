import { NextResponse } from 'next/server';
import { buildHistoricalComparison, STRATEGIC_PRESETS } from '@/lib/satellite/historical-providers';

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lng = parseFloat(searchParams.get('lng') || '');
    const beforeDate = searchParams.get('before') || '2020-01-15';
    const afterDate = searchParams.get('after') || '2024-01-15';
    const platform = (searchParams.get('platform') as 'Sentinel-2' | 'Sentinel-1' | 'NASA-GIBS') || 'Sentinel-2';
    const radiusKm = parseFloat(searchParams.get('radiusKm') || '10');
    const bboxParam = searchParams.get('bbox');
    const bbox = bboxParam ? (bboxParam.split(',').map(Number) as [number, number, number, number]) : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({
        error: 'Valid lat and lng required',
        presets: STRATEGIC_PRESETS,
      }, { status: 400 });
    }

    const comparison = await buildHistoricalComparison(lat, lng, beforeDate, afterDate, platform, radiusKm, bbox);

    return NextResponse.json({
      success: true,
      comparison,
      presets: STRATEGIC_PRESETS,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('[ORBINEX] Satellite comparison error:', error);
    return NextResponse.json(
      { error: 'Failed to build historical comparison', presets: STRATEGIC_PRESETS },
      { status: 500 }
    );
  }
}
