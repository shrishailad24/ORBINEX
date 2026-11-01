/**
 * ORBINEX — Raster Co-Registration & Geospatial Alignment Engine Wrapper (AI-05)
 * Interfaces with aligner.py to execute sub-pixel phase correlation, CRS reprojection,
 * common comparison grid resampling, and alignment quality metrics calculation.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export type AlignmentQualityStatus = 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'FAILED';

export interface RasterAlignmentMetrics {
  matched_features: number;
  accepted_inliers: number;
  inlier_ratio: number;
  shift_x_pixels: number;
  shift_y_pixels: number;
  displacement_meters: number;
  rmse_pixels: number;
  rmse_meters: number;
  correlation_confidence: number;
  spatial_overlap_pct: number;
  valid_pixel_overlap_pct: number;
}

export interface CommonGridInfo {
  width: number;
  height: number;
  common_gsd_meters: number;
  aoi_bbox: [number, number, number, number];
  target_crs: string;
  source_before_crs: string;
  source_after_crs: string;
  reprojected: boolean;
}

export interface SensorPairInfo {
  before_sensor: string;
  after_sensor: string;
  native_gsd_before_m: number;
  native_gsd_after_m: number;
  resolution_mismatch: boolean;
  is_cross_modality: boolean;
  registration_method: string;
}

export interface RasterAlignmentResult {
  status: 'success' | 'error' | 'warning';
  quality_status: AlignmentQualityStatus;
  suitability_summary: string;
  metrics: RasterAlignmentMetrics;
  grid: CommonGridInfo;
  sensors: SensorPairInfo;
  disclosures: string[];
  alignedBeforeUrl?: string;
  alignedAfterUrl?: string;
  checksumSha256?: string;
}

export interface RasterAlignmentRequest {
  beforePath: string;
  afterPath: string;
  aoiBbox: [number, number, number, number];
  beforeBbox?: [number, number, number, number];
  afterBbox?: [number, number, number, number];
  beforeSensor?: string;
  afterSensor?: string;
  beforeCrs?: string;
  afterCrs?: string;
  gridSize?: number;
}

/**
 * Executes server-side co-registration and geospatial alignment between two satellite rasters.
 */
export async function alignRasterPair(
  req: RasterAlignmentRequest
): Promise<RasterAlignmentResult> {
  const cacheDir = path.join(process.cwd(), '.cache', 'satellite-aligned');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const queryKey = `${req.beforePath}_${req.afterPath}_${req.aoiBbox.join(',')}_${req.beforeSensor}_${req.afterSensor}`;
  const hash = crypto.createHash('sha256').update(queryKey).digest('hex').slice(0, 16);

  const outBeforePng = path.join(cacheDir, `aligned_before_${hash}.png`);
  const outAfterPng = path.join(cacheDir, `aligned_after_${hash}.png`);
  const outJson = path.join(cacheDir, `alignment_meta_${hash}.json`);

  // Check cached alignment if outputs exist
  if (fs.existsSync(outJson) && fs.existsSync(outBeforePng) && fs.existsSync(outAfterPng)) {
    try {
      const cached = JSON.parse(fs.readFileSync(outJson, 'utf-8')) as RasterAlignmentResult;
      cached.alignedBeforeUrl = `/api/satellite/asset?file=${encodeURIComponent(outBeforePng)}`;
      cached.alignedAfterUrl = `/api/satellite/asset?file=${encodeURIComponent(outAfterPng)}`;
      return cached;
    } catch {
      // Re-run if cache corrupted
    }
  }

  const scriptPath = path.join(process.cwd(), 'src', 'lib', 'satellite', 'aligner.py');

  const args = [
    scriptPath,
    '--before', req.beforePath,
    '--after', req.afterPath,
    '--aoi-bbox', req.aoiBbox.join(','),
    '--before-sensor', req.beforeSensor || 'Sentinel-2',
    '--after-sensor', req.afterSensor || 'Sentinel-2',
    '--before-crs', req.beforeCrs || 'EPSG:4326',
    '--after-crs', req.afterCrs || 'EPSG:4326',
    '--grid-size', String(req.gridSize || 640),
    '--output-before-png', outBeforePng,
    '--output-after-png', outAfterPng,
    '--output-json', outJson,
  ];

  if (req.beforeBbox) {
    args.push('--before-bbox', req.beforeBbox.join(','));
  }
  if (req.afterBbox) {
    args.push('--after-bbox', req.afterBbox.join(','));
  }

  return new Promise<RasterAlignmentResult>((resolve, reject) => {
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonExe, args);

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (d) => {
      stdoutData += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Alignment engine failed with code ${code}: ${stderrData || stdoutData}`));
      }

      try {
        const parsed = JSON.parse(stdoutData.trim()) as RasterAlignmentResult;
        parsed.alignedBeforeUrl = `/api/satellite/asset?file=${encodeURIComponent(outBeforePng)}`;
        parsed.alignedAfterUrl = `/api/satellite/asset?file=${encodeURIComponent(outAfterPng)}`;
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse alignment output: ${stdoutData}`));
      }
    });

    // 25s timeout safeguard
    setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      reject(new Error('Raster co-registration engine timed out (25s ceiling).'));
    }, 25000);
  });
}
