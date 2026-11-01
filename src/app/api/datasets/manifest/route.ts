import { NextResponse } from 'next/server';
import { loadManifest, getDatasetCatalogueSummary } from '@/lib/datasets/acquisition-engine';

export async function GET() {
  try {
    const manifest = loadManifest();
    const summary = getDatasetCatalogueSummary();

    return NextResponse.json({
      success: true,
      manifest,
      summary,
      totalEntries: manifest.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ORBINEX-DATASETS] Manifest API error:', err);
    return NextResponse.json(
      { error: 'Failed to read dataset manifest', details: err.message },
      { status: 500 }
    );
  }
}
