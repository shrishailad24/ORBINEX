import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';

export const maxDuration = 30;

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

    // Convert relative URLs if pointing to localhost
    const resolveUrl = (u: string) => {
      if (u.startsWith('/')) {
        return `http://127.0.0.1:3000${u}`;
      }
      return u;
    };

    const pyArgs = [
      scriptPath,
      '--before', resolveUrl(beforeUrl),
      '--after', resolveUrl(afterUrl),
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
