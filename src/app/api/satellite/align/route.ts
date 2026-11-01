import { NextResponse } from 'next/server';
import { alignRasterPair, type RasterAlignmentRequest } from '@/lib/satellite/alignment';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RasterAlignmentRequest;

    if (!body.beforePath || !body.afterPath) {
      return NextResponse.json(
        { error: 'Missing required parameters: beforePath and afterPath are mandatory.' },
        { status: 400 }
      );
    }

    if (!body.aoiBbox || body.aoiBbox.length < 4) {
      return NextResponse.json(
        { error: 'Missing required parameter: valid aoiBbox [min_lng, min_lat, max_lng, max_lat] is mandatory.' },
        { status: 400 }
      );
    }

    const result = await alignRasterPair(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        quality_status: 'FAILED',
        error: error instanceof Error ? error.message : 'Raster co-registration failed',
      },
      { status: 500 }
    );
  }
}
