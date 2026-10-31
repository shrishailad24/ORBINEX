import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import crypto from 'crypto';
import { processSatelliteAsset } from '@/lib/satellite/image-processor';
import { validateBbox } from '@/lib/satellite/security';
import type { SatellitePlatform } from '@/lib/satellite/types';

export const maxDuration = 30;

async function resolveAssetToFile(inputUrl: string): Promise<string> {
  // If it's a relative or localhost /api/satellite/process URL
  if (inputUrl.includes('/api/satellite/process')) {
    const queryStr = inputUrl.split('?')[1] || '';
    const params = new URLSearchParams(queryStr);
    const rawUrl = params.get('url');
    if (!rawUrl) throw new Error('Missing url parameter in process query');

    const sceneBboxParam = params.get('sceneBbox');
    const aoiBboxParam = params.get('aoiBbox');
    const stretch = params.get('stretch') !== 'false';
    const platform = (params.get('platform') as SatellitePlatform) || 'Sentinel-2';
    const width = parseInt(params.get('width') || '768', 10);

    let sceneBbox: [number, number, number, number] | null = null;
    let aoiBbox: [number, number, number, number] | null = null;
    if (sceneBboxParam) {
      sceneBbox = validateBbox(sceneBboxParam.split(',').map(Number));
    }
    if (aoiBboxParam) {
      aoiBbox = validateBbox(aoiBboxParam.split(',').map(Number));
    }

    // Process asset to cache
    await processSatelliteAsset({
      inputUrl: rawUrl,
      sceneBbox,
      aoiBbox,
      stretch,
      platform,
      targetWidth: width,
    });

    const cacheDir = path.resolve(process.cwd(), '.cache', 'satellite-processed');
    const payload = JSON.stringify({
      url: rawUrl,
      sBbox: sceneBbox,
      aBbox: aoiBbox,
      stretch: Boolean(stretch),
      platform: platform || 'Sentinel-2',
      w: width || 768,
    });
    const key = crypto.createHash('sha256').update(payload).digest('hex');
    const cachedFile = path.join(cacheDir, `${key}.png`);
    if (fsSync.existsSync(cachedFile)) {
      return cachedFile;
    }
  }

  if (inputUrl.startsWith('/') && inputUrl.includes('url=')) {
    // e.g. /api/satellite/asset?url=...
    const raw = decodeURIComponent(inputUrl.split('url=')[1]);
    return raw;
  }

  return inputUrl;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { beforeUrl, afterUrl, areaKm2 = 100.0 } = body;

    if (!beforeUrl || !afterUrl) {
      return NextResponse.json(
        { error: 'beforeUrl and afterUrl are required' },
        { status: 400 }
      );
    }

    // SSRF protection
    const isAllowed = (u: string) => {
      try {
        const parsed = new URL(u);
        return (
          parsed.protocol === 'http:' ||
          parsed.protocol === 'https:' ||
          u.startsWith('/')
        );
      } catch {
        return false;
      }
    };

    if (!isAllowed(beforeUrl) || !isAllowed(afterUrl)) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'src', 'lib', 'satellite', 'analyzer.py');
    const hash = crypto.createHash('sha256').update(`${beforeUrl}:${afterUrl}:${areaKm2}`).digest('hex').slice(0, 16);
    const tempDir = path.join(os.tmpdir(), 'orbinex_analysis');
    await fs.mkdir(tempDir, { recursive: true });

    const outputJson = path.join(tempDir, `analysis_${hash}.json`);
    const outputHeatmap = path.join(tempDir, `heatmap_${hash}.png`);

    // Check disk cache
    try {
      const cached = await fs.readFile(outputJson, 'utf-8');
      const data = JSON.parse(cached);
      return NextResponse.json({
        ...data,
        cached: true,
      });
    } catch {
      // Run analysis
    }

    // Resolve URLs directly to local disk paths to bypass Windows socket loopback restriction
    const resolvedBefore = await resolveAssetToFile(beforeUrl);
    const resolvedAfter = await resolveAssetToFile(afterUrl);

    const pyArgs = [
      scriptPath,
      '--before', resolvedBefore,
      '--after', resolvedAfter,
      '--output-json', outputJson,
      '--output-heatmap', outputHeatmap,
      '--area-km2', String(areaKm2),
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', pyArgs);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Analyzer exited with code ${code}: ${stderr}`));
      });
      proc.on('error', reject);
    });

    const resultRaw = await fs.readFile(outputJson, 'utf-8');
    const result = JSON.parse(resultRaw);

    // Read heatmap as base64 preview
    try {
      const heatmapBuf = await fs.readFile(outputHeatmap);
      result.heatmapBase64 = `data:image/png;base64,${heatmapBuf.toString('base64')}`;
    } catch {}

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[ORBINEX] Satellite change analysis error:', err.message);
    return NextResponse.json(
      { error: 'Failed to analyze satellite scenes', details: err.message },
      { status: 500 }
    );
  }
}
