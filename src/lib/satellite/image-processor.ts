/**
 * ORBINEX — Satellite Image Processing Pipeline
 * Orchestrates spatial cropping, contrast stretching, and georeferencing sidecar generation.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { isAllowedSatelliteUrl, validateBbox } from './security';
import type { SatellitePlatform } from './types';

export interface ProcessSatelliteImageOptions {
  inputUrl: string;
  sceneBbox?: [number, number, number, number] | null;
  aoiBbox?: [number, number, number, number] | null;
  stretch?: boolean;
  platform?: SatellitePlatform;
  targetWidth?: number;
}

export interface SatelliteProcessedMetadata {
  source: string;
  platform: string;
  original_dimensions: [number, number];
  output_dimensions: [number, number];
  contrast_stretched: boolean;
  spatial_crop_applied: boolean;
  valid_pixel_pct?: number;
  swath_edge_detected?: boolean;
  scene_bbox: [number, number, number, number] | null;
  aoi_bbox: [number, number, number, number] | null;
  attribution: string;
  crs: string;
  format: string;
  file_bytes: number;
}

export interface ProcessedSatelliteResult {
  imageBuffer: Buffer;
  metadata: SatelliteProcessedMetadata;
  cacheHit: boolean;
}

const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'satellite-processed');

function ensureCacheDir(): string {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  return CACHE_DIR;
}

/**
 * Generates a deterministic hash for caching processed imagery.
 */
function computeCacheKey(opts: ProcessSatelliteImageOptions): string {
  const payload = JSON.stringify({
    url: opts.inputUrl,
    sBbox: opts.sceneBbox,
    aBbox: opts.aoiBbox,
    stretch: Boolean(opts.stretch),
    platform: opts.platform || 'Sentinel-2',
    w: opts.targetWidth || 768,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Processes a raw satellite asset via the ORBINEX Python Raster Engine.
 */
export async function processSatelliteAsset(
  opts: ProcessSatelliteImageOptions
): Promise<ProcessedSatelliteResult> {
  // 1. Strict Security & SSRF Validation
  if (!isAllowedSatelliteUrl(opts.inputUrl)) {
    throw new Error(`Satellite asset URL not authorized by security policy: ${opts.inputUrl}`);
  }

  // 2. Validate Bounding Boxes if provided
  let validSceneBbox: [number, number, number, number] | null = null;
  let validAoiBbox: [number, number, number, number] | null = null;

  if (opts.sceneBbox) {
    validSceneBbox = validateBbox(opts.sceneBbox);
  }
  if (opts.aoiBbox) {
    validAoiBbox = validateBbox(opts.aoiBbox);
  }

  const cacheDir = ensureCacheDir();
  const cacheKey = computeCacheKey(opts);
  const outPngPath = path.join(cacheDir, `${cacheKey}.png`);
  const outMetaPath = path.join(cacheDir, `${cacheKey}.meta.json`);

  // 3. Cache Check (Avoid re-processing identical imagery)
  if (fs.existsSync(outPngPath) && fs.existsSync(outMetaPath)) {
    try {
      const imageBuffer = fs.readFileSync(outPngPath);
      const metadata = JSON.parse(fs.readFileSync(outMetaPath, 'utf8')) as SatelliteProcessedMetadata;
      return { imageBuffer, metadata, cacheHit: true };
    } catch {
      // Corrupt cache, reprocess
    }
  }

  // 4. Spawn Python Raster Processor
  const scriptPath = path.resolve(process.cwd(), 'src', 'lib', 'satellite', 'processor.py');

  const args: string[] = [
    scriptPath,
    '--input', opts.inputUrl,
    '--output', outPngPath,
    '--meta-output', outMetaPath,
    '--platform', opts.platform || 'Sentinel-2',
    '--width', String(opts.targetWidth || 768),
  ];

  if (validSceneBbox) {
    args.push(`--scene-bbox=${validSceneBbox.join(',')}`);
  }
  if (validAoiBbox) {
    args.push(`--aoi-bbox=${validAoiBbox.join(',')}`);
  }
  if (opts.stretch !== false) {
    args.push('--stretch');
  }

  return new Promise<ProcessedSatelliteResult>((resolve, reject) => {
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonBin, args, { timeout: 35000 });

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to execute satellite processor: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Satellite processor failed (exit code ${code}): ${stderr}`));
      }

      try {
        if (!fs.existsSync(outPngPath) || !fs.existsSync(outMetaPath)) {
          return reject(new Error('Satellite processor finished without generating output assets'));
        }

        const imageBuffer = fs.readFileSync(outPngPath);
        const metadata = JSON.parse(fs.readFileSync(outMetaPath, 'utf8')) as SatelliteProcessedMetadata;

        resolve({
          imageBuffer,
          metadata,
          cacheHit: false,
        });
      } catch (e) {
        reject(new Error(`Failed to read processed satellite asset: ${e instanceof Error ? e.message : e}`));
      }
    });
  });
}
