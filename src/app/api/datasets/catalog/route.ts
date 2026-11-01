import { NextResponse } from 'next/server';
import { UNIFIED_DATASET_REGISTRY, DATASET_CATEGORIES } from '@/lib/datasets/registry';
import { getDatasetCatalogueSummary } from '@/lib/datasets/acquisition-engine';

export async function GET() {
  try {
    const summary = getDatasetCatalogueSummary();
    return NextResponse.json({
      success: true,
      categories: DATASET_CATEGORIES,
      datasets: UNIFIED_DATASET_REGISTRY,
      summary,
      totalDatasets: UNIFIED_DATASET_REGISTRY.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ORBINEX-DATASETS] Catalog API error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve dataset catalog', details: err.message },
      { status: 500 }
    );
  }
}
