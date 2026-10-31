/**
 * ORBINEX AI-03 — Satellite Imagery & Temporal Integrity Audit Tests
 * Validates:
 * - Nodata transparency & swath margin detection
 * - Insufficient valid-pixel coverage guard
 * - Multi-year baseline (>3 years) & seasonal phenology divergence detection
 * - Identical imagery guard (0% confidence on duplicate passes)
 * - Provider adapter truthful credential & metadata status
 * - High-resolution telemetry & GSD truthfulness
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { satelliteRegistry } from './providers';
import { evaluateAreaSuitability, calculateGeodesicArea } from './providers/small-area-evaluator';

describe('ORBINEX AI-03 — Satellite Imagery & Temporal Integrity Audit', () => {

  describe('1. Nodata Transparency & Swath Boundary Detection', () => {
    it('detects unobserved swath margins and calculates valid_pixel_pct with alpha mask', () => {
      const scriptPath = path.resolve(process.cwd(), 'src/lib/satellite/processor.py');
      const testDir = path.resolve(process.cwd(), '.cache/test_integrity');
      fs.mkdirSync(testDir, { recursive: true });

      // Generate a test synthetic image with 50% valid data and 50% black nodata swath margin
      const inImagePath = path.join(testDir, 'swath_test_in.png');
      const outImagePath = path.join(testDir, 'swath_test_out.png');
      const outMetaPath = path.join(testDir, 'swath_test_out.meta.json');

      const createScript = `
from PIL import Image
import numpy as np

arr = np.zeros((100, 100, 3), dtype=np.uint8)
# Left half is valid surface (vegetation green), right half is black nodata
arr[:, :50, 0] = 30
arr[:, :50, 1] = 140
arr[:, :50, 2] = 45

img = Image.fromarray(arr, mode='RGB')
img.save(r'${inImagePath}')
`;
      const createRes = spawnSync('python', ['-c', createScript], { encoding: 'utf-8' });
      expect(createRes.status).toBe(0);

      // Run processor.py
      const procRes = spawnSync('python', [
        scriptPath,
        '--input', inImagePath,
        '--output', outImagePath,
        '--meta-output', outMetaPath,
        '--stretch',
      ], { encoding: 'utf-8' });

      expect(procRes.status).toBe(0);
      expect(fs.existsSync(outImagePath)).toBe(true);
      expect(fs.existsSync(outMetaPath)).toBe(true);

      const meta = JSON.parse(fs.readFileSync(outMetaPath, 'utf-8'));
      // Valid pixels should be ~50%
      expect(meta.valid_pixel_pct).toBeGreaterThan(45);
      expect(meta.valid_pixel_pct).toBeLessThan(55);
      expect(meta.swath_edge_detected).toBe(true);

      // Verify that output PNG has 4 channels (RGBA) and nodata has alpha = 0
      const verifyScript = `
from PIL import Image
import numpy as np
out = Image.open(r'${outImagePath}')
arr = np.array(out)
assert arr.shape[2] == 4, f"Expected 4 channels (RGBA), got {arr.shape[2]}"
# Right half alpha should be 0 (transparent)
assert np.all(arr[:, 55:, 3] == 0), "Expected nodata region to have alpha=0"
# Left half alpha should be 255 (opaque)
assert np.all(arr[:, :45, 3] == 255), "Expected valid region to have alpha=255"
print("VERIFIED_TRANSPARENT")
`;
      const verifyRes = spawnSync('python', ['-c', verifyScript], { encoding: 'utf-8' });
      expect(verifyRes.stdout).toContain('VERIFIED_TRANSPARENT');
    });
  });

  describe('2. Temporal Gap & Seasonal Phenology Integrity', () => {
    it('detects 6+ year multi-year baseline and 4-month seasonal phenological mismatch', () => {
      const scriptPath = path.resolve(process.cwd(), 'src/lib/satellite/analyzer.py');
      const testDir = path.resolve(process.cwd(), '.cache/test_integrity');
      fs.mkdirSync(testDir, { recursive: true });

      const imgBefore = path.join(testDir, 'season_before.png');
      const imgAfter = path.join(testDir, 'season_after.png');
      const outJson = path.join(testDir, 'season_analysis.json');

      const genScript = `
from PIL import Image
import numpy as np
# Create distinct before and after images
b = np.full((64, 64, 3), 100, dtype=np.uint8)
b[:, :, 1] = 160  # Green
a = np.full((64, 64, 3), 100, dtype=np.uint8)
a[:, :, 0] = 160  # Brown/Cleared
Image.fromarray(b).save(r'${imgBefore}')
Image.fromarray(a).save(r'${imgAfter}')
`;
      spawnSync('python', ['-c', genScript]);

      // Analyze with 2020-02-29 vs 2026-10-27
      const res = spawnSync('python', [
        scriptPath,
        '--before', imgBefore,
        '--after', imgAfter,
        '--output-json', outJson,
        '--before-date', '2020-02-29',
        '--after-date', '2026-10-27',
      ], { encoding: 'utf-8' });

      expect(res.status).toBe(0);
      const report = JSON.parse(fs.readFileSync(outJson, 'utf-8'));

      // Validate temporal metrics
      expect(report.temporal_gap_days).toBeGreaterThan(2400); // ~6.6 years
      expect(report.seasonal_offset_months).toBe(4); // Feb (2) vs Oct (10): min(8, 4) = 4

      // Validate that findings include both scientific notices
      const findingsStr = report.findings.join(' ');
      expect(findingsStr).toContain('Extended multi-year baseline');
      expect(findingsStr).toContain('Seasonal phenological divergence');
      expect(findingsStr).toContain('Month 2 vs Month 10');
    });

    it('honestly flags insufficient valid surface overlap (<25%) and assigns 0% confidence', () => {
      const scriptPath = path.resolve(process.cwd(), 'src/lib/satellite/analyzer.py');
      const testDir = path.resolve(process.cwd(), '.cache/test_integrity');
      fs.mkdirSync(testDir, { recursive: true });

      const imgBefore = path.join(testDir, 'overlap_b.png');
      const imgAfter = path.join(testDir, 'overlap_a.png');
      const outJson = path.join(testDir, 'overlap_analysis.json');

      // Before has data only in top 20%, After has data only in bottom 20% -> 0% overlap
      const genScript = `
from PIL import Image
import numpy as np
b = np.zeros((100, 100, 4), dtype=np.uint8)
b[:20, :, :3] = 120
b[:20, :, 3] = 255

a = np.zeros((100, 100, 4), dtype=np.uint8)
a[80:, :, :3] = 120
a[80:, :, 3] = 255

Image.fromarray(b).save(r'${imgBefore}')
Image.fromarray(a).save(r'${imgAfter}')
`;
      spawnSync('python', ['-c', genScript]);

      const res = spawnSync('python', [
        scriptPath,
        '--before', imgBefore,
        '--after', imgAfter,
        '--output-json', outJson,
      ], { encoding: 'utf-8' });

      expect(res.status).toBe(0);
      const report = JSON.parse(fs.readFileSync(outJson, 'utf-8'));

      expect(report.status).toBe('warning');
      expect(report.valid_overlap_pct).toBe(0.0);
      expect(report.confidence_pct).toBe(0);
      expect(report.summary).toContain('Insufficient overlapping surface imagery');
    });

    it('assigns 0% confidence when before and after passes are identical', () => {
      const scriptPath = path.resolve(process.cwd(), 'src/lib/satellite/analyzer.py');
      const testDir = path.resolve(process.cwd(), '.cache/test_integrity');
      fs.mkdirSync(testDir, { recursive: true });

      const imgSame = path.join(testDir, 'same_pass.png');
      const outJson = path.join(testDir, 'same_analysis.json');

      const genScript = `
from PIL import Image
import numpy as np
img = np.full((64, 64, 3), 128, dtype=np.uint8)
Image.fromarray(img).save(r'${imgSame}')
`;
      spawnSync('python', ['-c', genScript]);

      const res = spawnSync('python', [
        scriptPath,
        '--before', imgSame,
        '--after', imgSame,
        '--output-json', outJson,
      ], { encoding: 'utf-8' });

      expect(res.status).toBe(0);
      const report = JSON.parse(fs.readFileSync(outJson, 'utf-8'));

      expect(report.status).toBe('warning');
      expect(report.confidence_pct).toBe(0);
      expect(report.summary).toContain('Both observation passes resolved to identical imagery');
    });
  });

  describe('3. Truthful Provider Credential & Metadata Verification', () => {
    it('verifies Open STAC is functional for open public rasters without API keys', async () => {
      const openAdapter = satelliteRegistry.getAdapter('element84-stac');
      expect(openAdapter).toBeDefined();
      const status = await openAdapter!.getStatus();
      expect(status.id).toBe('element84-stac');
      expect(status.isConfigured).toBe(true);
      expect(status.licensingTier).toBe('open_access');
    });

    it('truthfully marks commercial providers as unconfigured when API keys are absent', async () => {
      const airbus = satelliteRegistry.getAdapter('airbus-oneatlas');
      const planet = satelliteRegistry.getAdapter('planet-data');
      const maxar = satelliteRegistry.getAdapter('maxar-ard');

      expect(airbus).toBeDefined();
      expect(planet).toBeDefined();
      expect(maxar).toBeDefined();

      const airbusStatus = await airbus!.getStatus();
      const planetStatus = await planet!.getStatus();
      const maxarStatus = await maxar!.getStatus();

      // In development without user-provided paid credentials:
      if (!process.env.AIRBUS_API_KEY) {
        expect(airbusStatus.status).toBe('unconfigured');
        expect(airbusStatus.licensingTier).toBe('commercial_metadata_only');
      }
      if (!process.env.PLANET_API_KEY) {
        expect(planetStatus.status).toBe('unconfigured');
        expect(planetStatus.licensingTier).toBe('commercial_metadata_only');
      }
      if (!process.env.MAXAR_API_TOKEN) {
        expect(maxarStatus.status).toBe('unconfigured');
        expect(maxarStatus.licensingTier).toBe('commercial_metadata_only');
      }
    });
  });

  describe('4. Small-Area Benchmark & Resolution Telemetry Verification', () => {
    it('truthfully evaluates 2,000 sq ft (186 m2) micro plot against Sentinel-2 vs Pléiades Neo vs SkySat', () => {
      const aoiM2 = 185.8; // 2,000 sq ft

      // Sentinel-2 (10m)
      const s2Eval = evaluateAreaSuitability(aoiM2, 10.0, 'Sentinel-2');
      expect(s2Eval.pixelsOnAOI).toBe(2);
      expect(s2Eval.isSmallPlot).toBe(true);
      expect(s2Eval.suitabilityStatus).toBe('INSUFFICIENT');
      expect(s2Eval.suitabilitySummary).toContain('Insufficient resolution');

      // Planet SkySat (0.5m)
      const skysatEval = evaluateAreaSuitability(aoiM2, 0.5, 'Planet SkySat');
      expect(skysatEval.pixelsOnAOI).toBe(743);
      expect(skysatEval.suitabilityStatus).toBe('SUITABLE');

      // Pléiades Neo (0.3m PAN)
      const pneoEval = evaluateAreaSuitability(aoiM2, 0.3, 'Airbus Pléiades Neo');
      expect(pneoEval.pixelsOnAOI).toBe(2064);
      expect(pneoEval.suitabilityStatus).toBe('SUITABLE');
      expect(pneoEval.limitations.join(' ')).toContain('Monoscopic satellite imagery cannot verify internal building structural integrity');
    });
  });

});
