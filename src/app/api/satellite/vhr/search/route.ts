import { NextResponse } from 'next/server';
import { satelliteRegistry } from '@/lib/satellite/providers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bbox, lat, lng, radiusKm, targetDate, maxCloudCover, providerFilter, platform, limit } = body;

    const result = await satelliteRegistry.searchAll({
      bbox,
      lat,
      lng,
      radiusKm,
      targetDate,
      maxCloudCover,
      providerFilter,
      platform,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Commercial VHR discovery failed',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : undefined;
    const lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : undefined;
    const radiusKm = searchParams.get('radiusKm') ? parseFloat(searchParams.get('radiusKm')!) : undefined;
    const targetDate = searchParams.get('targetDate') || undefined;
    const provider = searchParams.get('provider') || undefined;

    const result = await satelliteRegistry.searchAll({
      lat,
      lng,
      radiusKm,
      targetDate,
      providerFilter: provider ? [provider] : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Commercial VHR discovery failed',
      },
      { status: 500 }
    );
  }
}
