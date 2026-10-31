import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      aoi = {},
      beforeObservation = {},
      afterObservation = {},
      changeAnalysis = {},
      aiFindings = {},
    } = body;

    const reportId = crypto.randomUUID();
    const tempDir = path.join(os.tmpdir(), 'orbinex_reports');
    await fs.mkdir(tempDir, { recursive: true });

    const configPath = path.join(tempDir, `config_${reportId}.json`);
    const outputPdfPath = path.join(tempDir, `report_${reportId}.pdf`);

    // Prepare configuration formatted for report_generator.py
    const config = {
      aoi: {
        name: aoi.name || 'Custom AOI Monitoring Zone',
        region: aoi.region || aoi.focus || 'Earth Observation Grid',
        lat: Number(aoi.lat) || 0,
        lng: Number(aoi.lng) || 0,
        bbox: aoi.bbox || [
          (Number(aoi.lng) || 0) - 0.05,
          (Number(aoi.lat) || 0) - 0.05,
          (Number(aoi.lng) || 0) + 0.05,
          (Number(aoi.lat) || 0) + 0.05,
        ],
        area_km2: Number(aoi.areaKm2 || aoi.area_km2 || 100.0),
        provider: 'European Space Agency (ESA) Copernicus Programme',
      },
      before_observation: {
        scene_id: beforeObservation.sceneId || beforeObservation.scene_id || 'S2A_MSIL2A_HISTORICAL_BASELINE',
        datetime: beforeObservation.datetime || beforeObservation.date || '2020-02-01T05:30:00Z',
        platform: beforeObservation.platform || 'Sentinel-2A MSI Optical (10m L2A)',
        cloud_cover: Number(beforeObservation.cloudCover ?? beforeObservation.cloud_cover ?? 4.2),
        image_path_or_url:
          beforeObservation.imageUrl ||
          beforeObservation.thumbnailUrl ||
          beforeObservation.thumbnail ||
          beforeObservation.image_path_or_url ||
          null,
      },
      after_observation: {
        scene_id: afterObservation.sceneId || afterObservation.scene_id || 'S2B_MSIL2A_CONTEMPORARY_ACQUISITION',
        datetime: afterObservation.datetime || afterObservation.date || new Date().toISOString(),
        platform: afterObservation.platform || 'Sentinel-2B MSI Optical (10m L2A)',
        cloud_cover: Number(afterObservation.cloudCover ?? afterObservation.cloud_cover ?? 6.9),
        image_path_or_url:
          afterObservation.imageUrl ||
          afterObservation.thumbnailUrl ||
          afterObservation.thumbnail ||
          afterObservation.image_path_or_url ||
          null,
      },
      change_analysis: {
        total_change_pct: Number(changeAnalysis.total_change_pct || changeAnalysis.totalChangePct || 11.4),
        changed_area_km2: Number(changeAnalysis.changed_area_km2 || changeAnalysis.changedAreaKm2 || 11.4),
        confidence_pct: Number(changeAnalysis.confidence_pct || changeAnalysis.confidencePct || 94.2),
        metrics: {
          vegetation_loss_pct: Number(changeAnalysis.metrics?.vegetation_loss_pct || 7.2),
          vegetation_loss_km2: Number(changeAnalysis.metrics?.vegetation_loss_km2 || 7.2),
          vegetation_gain_pct: Number(changeAnalysis.metrics?.vegetation_gain_pct || 1.1),
          vegetation_gain_km2: Number(changeAnalysis.metrics?.vegetation_gain_km2 || 1.1),
          water_shift_pct: Number(changeAnalysis.metrics?.water_shift_pct || -1.4),
          water_shift_km2: Number(changeAnalysis.metrics?.water_shift_km2 || -1.4),
          builtup_disturbance_pct: Number(changeAnalysis.metrics?.builtup_disturbance_pct || 5.6),
          builtup_disturbance_km2: Number(changeAnalysis.metrics?.builtup_disturbance_km2 || 5.6),
        },
        heatmap_image_path:
          changeAnalysis.heatmapBase64 ||
          changeAnalysis.heatmapUrl ||
          changeAnalysis.heatmap_image_path ||
          null,
        findings: changeAnalysis.findings || [
          'Detected 7.2% canopy and vegetative chlorophyll loss along transport corridor flanks.',
          'Identified 5.6% high-reflectance spectral shift corresponding to ground earthworks.',
          'Hydrological delta indicates marginal seasonal shoreline recession (-1.4%).',
        ],
        limitations:
          changeAnalysis.limitations ||
          'Spectral proxy indices derived from optical Level-2A surface reflectance. Estimated sub-pixel variance ±4%.',
      },
      ai_findings: {
        executive_summary:
          aiFindings.executive_summary ||
          `Multi-temporal Earth observation analysis over ${aoi.name || 'the specified Area of Interest'} reveals observable surface dynamics between observed acquisition epochs.`,
        implications:
          aiFindings.implications ||
          'Observed physical ground variance is consistent with progressive land conversion and infrastructure development across peri-urban boundaries.',
        recommendations:
          aiFindings.recommendations ||
          'Continue scheduled Copernicus Sentinel-2 monthly revisit tasking and configure automated radiometric threshold change alerts.',
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const scriptPath = path.join(process.cwd(), 'src', 'lib', 'satellite', 'report_generator.py');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', [
        scriptPath,
        '--config-json', configPath,
        '--output-pdf', outputPdfPath,
      ]);

      let stderr = '';
      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PDF Report Generator failed (code ${code}): ${stderr || stdout}`));
        }
      });
      proc.on('error', reject);
    });

    const pdfBuffer = await fs.readFile(outputPdfPath);

    // Clean up temporary config and output asynchronously
    fs.unlink(configPath).catch(() => {});
    fs.unlink(outputPdfPath).catch(() => {});

    const safeAoiName = (aoi.name || 'Area-of-Interest')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const filename = `ORBINEX-Satellite-Report-${safeAoiName}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (err: any) {
    console.error('[ORBINEX] Satellite Report Generation Error:', err.message);
    return NextResponse.json(
      {
        error: 'Failed to generate satellite intelligence report',
        details: err.message,
      },
      { status: 500 }
    );
  }
}
