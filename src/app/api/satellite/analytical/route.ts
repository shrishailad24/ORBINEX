import { NextRequest, NextResponse } from 'next/server';
import {
  inspectCogMetadata,
  extractAnalyticalAoiWindow,
  buildAnalyticalPair,
  SENTINEL2_BAND_CATALOG,
  type AnalyticalStatus,
} from '@/lib/satellite/cog-reader';
import { constructPrithviInputCube, runPrithviInference, type PrithviModelVariant } from '@/lib/satellite/prithvi-foundation';
import { executeOscdTestSplitBenchmark } from '@/lib/satellite/benchmarks/oscd-benchmark';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action = 'compare',
      cogUrl,
      aoiBbox,
      aoiName = 'Custom AOI Analysis Zone',
      beforeScene,
      afterScene,
      bands = ['B04', 'B08'],
      modelVariant = 'Prithvi-EO-2.0-300M',
      includeBenchmark = false,
      requestedDates = { before: '2020-01-15', after: '2024-01-15' },
    } = body;

    // ─────────────────────────────────────────────────────────────
    // ACTION 1: Inspect COG Metadata & HTTP Range Support
    // ─────────────────────────────────────────────────────────────
    if (action === 'inspect') {
      if (!cogUrl || typeof cogUrl !== 'string') {
        return NextResponse.json(
          { status: 'FAILED', error: 'Missing required "cogUrl" parameter for inspection' },
          { status: 400 }
        );
      }

      try {
        const metadata = await inspectCogMetadata(cogUrl);
        return NextResponse.json({
          status: 'SUCCESS' as AnalyticalStatus,
          metadata,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        const isRangeNotSupported = err.message?.includes('RANGE_NOT_SUPPORTED');
        return NextResponse.json(
          {
            status: (isRangeNotSupported ? 'RANGE_NOT_SUPPORTED' : 'FAILED') as AnalyticalStatus,
            error: err.message,
          },
          { status: isRangeNotSupported ? 416 : 500 }
        );
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Validate AOI Bounding Box for Window Extraction and Comparison
    // ─────────────────────────────────────────────────────────────
    if (!aoiBbox || !Array.isArray(aoiBbox) || aoiBbox.length !== 4) {
      return NextResponse.json(
        { status: 'FAILED', error: 'Valid AOI bounding box [minLng, minLat, maxLng, maxLat] is required.' },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 2: Extract AOI Window for Single Scene
    // ─────────────────────────────────────────────────────────────
    if (action === 'extract') {
      const scene = body.scene || beforeScene || afterScene;
      if (!scene) {
        return NextResponse.json(
          { status: 'INSUFFICIENT_DATA', error: 'Scene with assets is required for AOI window extraction.' },
          { status: 400 }
        );
      }

      const bandUrls = getBandUrls(scene);
      const windowResult = await extractAnalyticalAoiWindow(
        bandUrls,
        aoiBbox as [number, number, number, number],
        scene.id || 'SCENE',
        scene.datetime || new Date().toISOString(),
        bands
      );

      return NextResponse.json({
        status: windowResult.status,
        aoi: { name: aoiName, bbox: aoiBbox },
        window: windowResult,
        timestamp: new Date().toISOString(),
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 3: Compare Dual-Temporal Analytical Pair (Default)
    // ─────────────────────────────────────────────────────────────
    if (!beforeScene || !afterScene) {
      return NextResponse.json(
        {
          status: 'INSUFFICIENT_DATA' as AnalyticalStatus,
          error: 'Both BEFORE and AFTER satellite scenes are required for analytical multi-temporal inference.',
        },
        { status: 400 }
      );
    }

    const beforeBandUrls = getBandUrls(beforeScene);
    const afterBandUrls = getBandUrls(afterScene);

    const pairResult = await buildAnalyticalPair(
      { id: beforeScene.id || 'BEFORE', datetime: beforeScene.datetime || requestedDates.before, assets: beforeBandUrls },
      { id: afterScene.id || 'AFTER', datetime: afterScene.datetime || requestedDates.after, assets: afterBandUrls },
      aoiBbox as [number, number, number, number],
      requestedDates,
      ['B02', 'B03', 'B04', 'B08', 'B8A', 'B11', 'B12']
    );

    // If valid overlap is insufficient (<25%), return early without computing model inference
    if (pairResult.status === 'INSUFFICIENT_DATA') {
      return NextResponse.json(pairResult);
    }

    // Execute Prithvi-EO-2.0 Foundation Model inference if bands are available
    let prithviResult = null;
    try {
      const beforeBandArrays = Object.fromEntries(
        Object.entries(pairResult.before.bands).map(([k, v]) => [k, v.data])
      );
      const afterBandArrays = Object.fromEntries(
        Object.entries(pairResult.after.bands).map(([k, v]) => [k, v.data])
      );

      if (Object.keys(beforeBandArrays).length >= 6 && Object.keys(afterBandArrays).length >= 6) {
        const inputCube = constructPrithviInputCube(beforeBandArrays, afterBandArrays, 256, 256);
        prithviResult = await runPrithviInference(inputCube, modelVariant as PrithviModelVariant);
      }
    } catch (modelErr: any) {
      console.warn('[ANALYTICAL-API] Prithvi model execution notice:', modelErr.message);
    }

    // Optional Benchmark Baseline
    let benchmarkBaseline = null;
    if (includeBenchmark) {
      benchmarkBaseline = executeOscdTestSplitBenchmark();
    }

    return NextResponse.json({
      status: pairResult.status,
      aoi: {
        name: aoiName,
        bbox: aoiBbox,
      },
      pair: pairResult,
      spectralIndices: {
        before: {
          ndvi: pairResult.before.metrics.meanNdvi,
          ndwi: pairResult.before.metrics.meanNdwi,
          ndii: pairResult.before.metrics.meanNdii,
          validCoveragePct: pairResult.before.metrics.validDataCoveragePct,
        },
        after: {
          ndvi: pairResult.after.metrics.meanNdvi,
          ndwi: pairResult.after.metrics.meanNdwi,
          ndii: pairResult.after.metrics.meanNdii,
          validCoveragePct: pairResult.after.metrics.validDataCoveragePct,
        },
        deltas: {
          deltaNdvi: pairResult.spectralDeltas.deltaNdviMean,
          deltaNdwi: pairResult.spectralDeltas.deltaNdwiMean,
          deltaNdii: pairResult.spectralDeltas.deltaNdiiMean,
        },
        summary: `Analytical spectral delta: ${
          (pairResult.spectralDeltas.deltaNdviMean ?? 0) < -0.05
            ? 'Vegetation loss / canopy stress'
            : (pairResult.spectralDeltas.deltaNdviMean ?? 0) > 0.05
              ? 'Vegetation increase / greening'
              : 'Stable vegetation baseline'
        } (${pairResult.spectralDeltas.significantChangeAreaPct}% significant change area).`,
      },
      prithviFoundationModel: prithviResult
        ? {
            modelVariant: prithviResult.modelVariant,
            modelVersion: prithviResult.modelVersion,
            changeProbability: prithviResult.metrics.meanChangeConfidence,
            confidence: 1.0 - prithviResult.metrics.changedAreaPct / 100,
            embeddingsDimension: prithviResult.embeddingDim,
            downstreamHead: prithviResult.downstreamHeadType,
            executionTimeMs: prithviResult.provenance.executionTimeMs,
            limitations: prithviResult.limitations,
          }
        : null,
      benchmark: benchmarkBaseline
        ? {
            name: benchmarkBaseline.benchmarkName,
            split: '14 Train / 10 Test (Scene-Isolated)',
            iou: benchmarkBaseline.aggregateMetrics.iou,
            f1: benchmarkBaseline.aggregateMetrics.f1Score,
            precision: benchmarkBaseline.aggregateMetrics.precision,
            recall: benchmarkBaseline.aggregateMetrics.recall,
            falseAlarmRate: benchmarkBaseline.aggregateMetrics.falseAlarmRate,
            overallAccuracy: benchmarkBaseline.aggregateMetrics.overallAccuracy,
            separationNotice: benchmarkBaseline.levirCdSeparationNotice,
          }
        : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ANALYTICAL-API] Fatal analytical processing error:', err);
    return NextResponse.json(
      {
        status: 'FAILED' as AnalyticalStatus,
        error: 'Analytical satellite processing failed',
        details: err.message,
      },
      { status: 500 }
    );
  }
}

function getBandUrls(scene: any): Record<string, string> {
  const sceneId = scene.id || scene.sceneId || 'S2B_MSIL2A';
  if (scene.assets && typeof scene.assets === 'object') {
    const urls: Record<string, string> = {};
    for (const [k, v] of Object.entries(scene.assets)) {
      if (typeof v === 'string') urls[k] = v;
      else if (v && typeof v === 'object' && 'href' in v) urls[k] = (v as any).href;
    }
    return urls;
  }

  const baseS3Url = scene.assetUrl
    ? scene.assetUrl.replace(/\/[^/]+\.jpg$/i, '').replace(/\/[^/]+\.tif$/i, '')
    : `https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/6/J/WT/2026/11/${sceneId}`;

  return {
    B02: `${baseS3Url}/B02.tif`,
    B03: `${baseS3Url}/B03.tif`,
    B04: `${baseS3Url}/B04.tif`,
    B08: `${baseS3Url}/B08.tif`,
    B8A: `${baseS3Url}/B8A.tif`,
    B11: `${baseS3Url}/B11.tif`,
    B12: `${baseS3Url}/B12.tif`,
  };
}
