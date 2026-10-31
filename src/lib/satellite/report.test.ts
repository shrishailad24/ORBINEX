import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { spawn } from 'child_process';

describe('ORBINEX Satellite PDF Report Generator', () => {
  it('builds an authoritative multi-page binary PDF dossier', async () => {
    const tempDir = path.join(os.tmpdir(), 'orbinex_test_pdf');
    await fs.mkdir(tempDir, { recursive: true });

    const configPath = path.join(tempDir, 'test_cfg.json');
    const pdfPath = path.join(tempDir, 'test_report.pdf');

    const config = {
      aoi: {
        name: 'Western Ghats Forest Corridor',
        region: 'Karnataka, India',
        lat: 14.52,
        lng: 74.88,
        bbox: [74.75, 14.40, 75.05, 14.65],
        area_km2: 128.4,
      },
      before_observation: {
        scene_id: 'S2A_MSIL2A_20200201T051511',
        datetime: '2020-02-01T05:15:11Z',
        platform: 'Sentinel-2A MSI Optical (10m)',
        cloud_cover: 4.1,
      },
      after_observation: {
        scene_id: 'S2B_MSIL2A_20240201T051439',
        datetime: '2024-02-01T05:14:39Z',
        platform: 'Sentinel-2B MSI Optical (10m)',
        cloud_cover: 6.9,
      },
      change_analysis: {
        total_change_pct: 12.8,
        changed_area_km2: 16.4,
        confidence_pct: 95.2,
        metrics: {
          vegetation_loss_pct: 7.8,
          vegetation_loss_km2: 10.0,
          vegetation_gain_pct: 1.2,
          vegetation_gain_km2: 1.5,
          water_shift_pct: -0.9,
          water_shift_km2: -1.2,
          builtup_disturbance_pct: 4.7,
          builtup_disturbance_km2: 6.0,
        },
        findings: [
          'Canopy fragmentation detected along secondary logging tracks.',
          'Linear infrastructure expansion with ground clearance.',
        ],
      },
      ai_findings: {
        executive_summary: 'Targeted forest canopy loss detected within buffer zone.',
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config), 'utf-8');

    const scriptPath = path.join(process.cwd(), 'src', 'lib', 'satellite', 'report_generator.py');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', [
        scriptPath,
        '--config-json', configPath,
        '--output-pdf', pdfPath,
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Exit code ${code}: ${stderr}`));
      });
      proc.on('error', reject);
    });

    const stat = await fs.stat(pdfPath);
    expect(stat.size).toBeGreaterThan(5000);

    const buf = await fs.readFile(pdfPath);
    // PDF Magic Header check
    const header = buf.subarray(0, 8).toString('ascii');
    expect(header).toContain('%PDF-1.');

    // Check for PDF trailer and page objects
    const content = buf.toString('latin1');
    expect(content).toContain('%%EOF');
    expect(content).toContain('/Type /Page');
    expect(content).toContain('/Producer (ReportLab');

    // Clean up
    await fs.unlink(configPath).catch(() => {});
    await fs.unlink(pdfPath).catch(() => {});
  });
});
