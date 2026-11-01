import { NextRequest, NextResponse } from 'next/server';
import { discoverDatasetsForAOI } from '@/lib/datasets/acquisition-engine';
import type { DatasetCategory } from '@/lib/datasets/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bbox, categories } = body;

    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return NextResponse.json(
        { error: 'Valid AOI bounding box [minLng, minLat, maxLng, maxLat] is required.' },
        { status: 400 }
      );
    }

    const discovered = discoverDatasetsForAOI(
      bbox as [number, number, number, number],
      categories as DatasetCategory[] | undefined
    );

    return NextResponse.json({
      success: true,
      aoiBbox: bbox,
      totalAvailable: discovered.length,
      datasets: discovered,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ORBINEX-DATASETS] Discover API error:', err);
    return NextResponse.json(
      { error: 'Failed to discover datasets for AOI', details: err.message },
      { status: 500 }
    );
  }
}
