import { NextRequest, NextResponse } from 'next/server';
import { acquireDatasetForAOI } from '@/lib/datasets/acquisition-engine';
import type { DatasetAcquisitionRequest } from '@/lib/datasets/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      datasetId,
      aoiBbox,
      aoiName,
      targetDate,
      targetResolutionMeters,
      format,
    } = body;

    if (!datasetId || typeof datasetId !== 'string') {
      return NextResponse.json(
        { error: 'datasetId string is required.' },
        { status: 400 }
      );
    }

    if (!aoiBbox || !Array.isArray(aoiBbox) || aoiBbox.length !== 4) {
      return NextResponse.json(
        { error: 'Valid AOI bounding box [minLng, minLat, maxLng, maxLat] is required.' },
        { status: 400 }
      );
    }

    const acquisitionReq: DatasetAcquisitionRequest = {
      datasetId,
      aoiBbox: aoiBbox as [number, number, number, number],
      aoiName: aoiName || 'Custom Monitoring AOI',
      targetDate,
      targetResolutionMeters,
      format,
    };

    const result = await acquireDatasetForAOI(acquisitionReq);

    return NextResponse.json({
      success: true,
      entry: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ORBINEX-DATASETS] Acquire API error:', err);
    return NextResponse.json(
      { error: err.message || 'Dataset acquisition failed', details: err.message },
      { status: err.message?.includes('Commercial') ? 403 : 500 }
    );
  }
}
