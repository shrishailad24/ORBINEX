import { describe, it, expect, beforeAll } from 'vitest';
import { alignRasterPair } from './alignment';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Phase 2 / AI-05 — Raster Co-Registration & Geospatial Alignment Engine', () => {
  const scratchDir = path.join(process.cwd(), '.cache', 'test-alignment-fixtures');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  function runPython(code: string): string {
    const tmpScript = path.join(scratchDir, `run_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
    fs.writeFileSync(tmpScript, code, 'utf-8');
    try {
      return execSync(`python "${tmpScript}"`, { encoding: 'utf-8' });
    } finally {
      try { fs.unlinkSync(tmpScript); } catch {}
    }
  }

  const bPath = path.join(scratchDir, 'test_before.png');
  const aPath = path.join(scratchDir, 'test_after.png');

  beforeAll(() => {
    runPython(`
import numpy as np
from PIL import Image

np.random.seed(42)
base = np.full((128, 128, 3), 110, dtype=np.uint8)
base[40:50, :] = [80, 120, 80]
base[:, 60:66] = [40, 90, 160]
base[20:35, 20:35] = [180, 170, 160]

img_b = Image.fromarray(base, mode='RGB')
img_b.save(r'${bPath}')

shifted = np.roll(base, shift=1, axis=0)
shifted = np.roll(shifted, shift=2, axis=1)
img_a = Image.fromarray(shifted, mode='RGB')
img_a.save(r'${aPath}')
`);
  });

  describe('1. CRS Normalization & UTM Zone Computation', () => {
    it('computes exact UTM EPSG projections across global quadrants', () => {
      const res = runPython(`
import sys
sys.path.append('src/lib/satellite')
import aligner

epsg_ny, z_ny, h_ny = aligner.compute_utm_epsg(40.71, -74.00)
assert epsg_ny == 'EPSG:32618', f'Expected 32618, got {epsg_ny}'

epsg_lon, z_lon, h_lon = aligner.compute_utm_epsg(51.50, -0.12)
assert epsg_lon == 'EPSG:32630', f'Expected 32630, got {epsg_lon}'

epsg_amz, z_amz, h_amz = aligner.compute_utm_epsg(-3.46, -62.21)
assert epsg_amz == 'EPSG:32720', f'Expected 32720, got {epsg_amz}'

epsg_tok, z_tok, h_tok = aligner.compute_utm_epsg(35.67, 139.65)
assert epsg_tok == 'EPSG:32654', f'Expected 32654, got {epsg_tok}'
print('UTM_OK')
`);
      expect(res).toContain('UTM_OK');
    });

    it('verifies invertible WGS84 to Web Mercator projection', () => {
      const res = runPython(`
import sys
sys.path.append('src/lib/satellite')
import aligner

lat, lng = 26.02, 89.98
x, y = aligner.wgs84_to_web_mercator(lat, lng)
lat_back, lng_back = aligner.web_mercator_to_wgs84(x, y)

assert abs(lat - lat_back) < 1e-5, f'Lat error: {lat} vs {lat_back}'
assert abs(lng - lng_back) < 1e-5, f'Lng error: {lng} vs {lng_back}'
print('PROJ_OK')
`);
      expect(res).toContain('PROJ_OK');
    });
  });

  describe('2. Raster Metadata Validation & Affine Transforms', () => {
    it('validates raster affine matrix and nominal GSD', () => {
      const res = runPython(`
import sys
from PIL import Image
sys.path.append('src/lib/satellite')
import aligner

img = Image.new('RGB', (100, 100))
bbox = [89.9, 25.9, 90.1, 26.1]
meta = aligner.validate_raster(img, bbox, 'EPSG:4326')

assert meta['width'] == 100
assert meta['height'] == 100
assert len(meta['affine']) == 6
assert meta['nominal_gsd_m'] > 0
print(f"GSD_OK: {meta['nominal_gsd_m']}m")
`);
      expect(res).toContain('GSD_OK');
    });

    it('rejects degenerate bounding box with min >= max', () => {
      const res = runPython(`
import sys
from PIL import Image
sys.path.append('src/lib/satellite')
import aligner

img = Image.new('RGB', (100, 100))
try:
    aligner.validate_raster(img, [90.0, 26.0, 89.0, 25.0])
    print('FAILED_TO_REJECT')
except ValueError as e:
    print('REJECTED_DEGENERATE_OK')
`);
      expect(res).toContain('REJECTED_DEGENERATE_OK');
    });
  });

  describe('3. Sub-Pixel Co-Registration & Quality Metrics Execution', () => {
    it('executes full raster alignment pipeline and measures geometric displacement', async () => {
      const result = await alignRasterPair({
        beforePath: bPath,
        afterPath: aPath,
        aoiBbox: [89.9, 25.9, 90.1, 26.1],
        beforeSensor: 'Sentinel-2',
        afterSensor: 'Sentinel-2',
        beforeCrs: 'EPSG:4326',
        afterCrs: 'EPSG:4326',
        gridSize: 320,
      });

      expect(result.status).toBe('success');
      expect(result.quality_status).toBe('GOOD');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.valid_pixel_overlap_pct).toBeGreaterThan(80.0);
      expect(result.metrics.rmse_pixels).toBeLessThanOrEqual(1.0);
      expect(result.grid.target_crs).toContain('EPSG:');
      expect(result.alignedBeforeUrl).toBeDefined();
      expect(result.alignedAfterUrl).toBeDefined();
    });

    it('handles multi-resolution comparison honestly (Sentinel-2 10m vs Pléiades Neo 0.3m)', async () => {
      const result = await alignRasterPair({
        beforePath: bPath,
        afterPath: aPath,
        aoiBbox: [89.9, 25.9, 90.1, 26.1],
        beforeSensor: 'Sentinel-2',
        afterSensor: 'Pléiades Neo',
        gridSize: 320,
      });

      expect(result.status).toBe('success');
      expect(result.sensors.resolution_mismatch).toBe(true);
      expect(result.disclosures.length).toBeGreaterThan(0);
      expect(result.disclosures[0]).toContain('Multi-Resolution');
      expect(result.disclosures[0]).toContain('No synthetic high-frequency pixels fabricated');
    });

    it('handles cross-modality comparison (Sentinel-2 Optical vs Sentinel-1 SAR)', async () => {
      const result = await alignRasterPair({
        beforePath: bPath,
        afterPath: aPath,
        aoiBbox: [89.9, 25.9, 90.1, 26.1],
        beforeSensor: 'Sentinel-2',
        afterSensor: 'Sentinel-1 SAR',
        gridSize: 320,
      });

      expect(result.status).toBe('success');
      expect(result.sensors.is_cross_modality).toBe(true);
      expect(result.sensors.registration_method).toContain('Gradient Magnitude');
      expect(result.disclosures.some(d => d.includes('Cross-Modality'))).toBe(true);
    });

    it('rejects pairs with insufficient valid overlap (<25%) under FAILED status', () => {
      const res = runPython(`
import sys
from PIL import Image
sys.path.append('src/lib/satellite')
import aligner

img_b = Image.new('RGBA', (64, 64), (100, 150, 100, 255))
img_a = Image.new('RGBA', (64, 64), (100, 150, 100, 255))

res, _, _ = aligner.co_register_raster_pair(
    img_b, img_a,
    before_bbox=[0.0, 0.0, 1.0, 1.0],
    after_bbox=[20.0, 20.0, 21.0, 21.0],
    aoi_bbox=[10.0, 10.0, 11.0, 11.0]
)

assert res['quality_status'] == 'FAILED', f"Expected FAILED, got {res['quality_status']}"
assert res['metrics']['valid_pixel_overlap_pct'] == 0.0
print('DISJOINT_REJECTION_OK')
`);
      expect(res).toContain('DISJOINT_REJECTION_OK');
    });
  });
});
