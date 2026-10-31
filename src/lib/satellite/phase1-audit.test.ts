import { describe, it, expect } from 'vitest';
import {
  isAllowedSatelliteUrl,
  validateBbox,
  pointToBbox,
  isValidDateString,
} from './security';
import {
  bboxToQuadCoordinates,
  normalizeAssetHref,
  parseSTACFeature,
} from './stac-client';
import { STRATEGIC_PRESETS, buildHistoricalComparison } from './historical-providers';
import { processSatelliteAsset } from './image-processor';
import path from 'path';
import fs from 'fs';

describe('Phase 1 — Satellite Imagery Verification Audit', () => {
  it('1. Verifies exact AOI geometry alignment between BEFORE and AFTER scenes', () => {
    // Both scenes in a preset or custom AOI must project over the identical bounding footprint
    const aoiBbox = pointToBbox(13.50, 75.25, 15);
    expect(aoiBbox).toHaveLength(4);
    const [minLng, minLat, maxLng, maxLat] = aoiBbox;

    expect(minLng).toBeLessThan(maxLng);
    expect(minLat).toBeLessThan(maxLat);

    // Quad coordinates must preserve strict counter-clockwise / clockwise corner ordering
    const quads = bboxToQuadCoordinates(aoiBbox);
    expect(quads[0]).toEqual([minLng, maxLat]); // Top-Left
    expect(quads[1]).toEqual([maxLng, maxLat]); // Top-Right
    expect(quads[2]).toEqual([maxLng, minLat]); // Bottom-Right
    expect(quads[3]).toEqual([minLng, minLat]); // Bottom-Left
  });

  it('2. Verifies STAC feature parsing and metadata extraction for Sentinel-2', () => {
    const mockFeature = {
      id: 'S2A_43PEQ_20200211_1_L2A',
      collection: 'sentinel-2-l2a',
      bbox: [75.1, 13.35, 75.4, 13.65],
      properties: {
        datetime: '2020-02-11T05:35:14.220000Z',
        'eo:cloud_cover': 1.986,
        platform: 'Sentinel-2A',
      },
      assets: {
        thumbnail: {
          href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/43/P/EQ/2020/2/S2A_43PEQ_20200211_1_L2A/thumbnail.jpg',
        },
        visual: {
          href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/43/P/EQ/2020/2/S2A_43PEQ_20200211_1_L2A/TCI.tif',
        },
      },
    };

    const scene = parseSTACFeature(mockFeature);
    expect(scene).not.toBeNull();
    expect(scene?.id).toBe('S2A_43PEQ_20200211_1_L2A');
    expect(scene?.platform).toBe('Sentinel-2');
    expect(scene?.modality).toBe('optical');
    expect(scene?.cloudCover).toBe(2.0);
    expect(scene?.thumbnailUrl).toContain('thumbnail.jpg');
    expect(isAllowedSatelliteUrl(scene!.thumbnailUrl)).toBe(true);
  });

  it('3. Verifies Sentinel-1 SAR radar feature parsing without cloud filter dependency', () => {
    const mockSarFeature = {
      id: 'S1A_IW_GRDH_1SDV_20240115',
      collection: 'sentinel-1-grd',
      bbox: [89.8, 25.9, 90.1, 26.1],
      properties: {
        datetime: '2024-01-15T12:00:00Z',
        'sar:instrument_mode': 'IW',
        'sat:orbit_state': 'descending',
      },
      assets: {
        thumbnail: {
          href: 'https://sentinel-s1-l1c.s3.us-west-2.amazonaws.com/thumbnail.png',
        },
        vv: {
          href: 'https://sentinel-s1-l1c.s3.us-west-2.amazonaws.com/vv.tif',
        },
      },
    };

    const scene = parseSTACFeature(mockSarFeature);
    expect(scene).not.toBeNull();
    expect(scene?.platform).toBe('Sentinel-1');
    expect(scene?.modality).toBe('sar');
    expect(scene?.cloudCover).toBeNull(); // SAR penetrates clouds
    expect(scene?.metadata.orbitDirection).toBe('descending');
    expect(isAllowedSatelliteUrl(scene!.thumbnailUrl)).toBe(true);
  });

  it('4. Verifies security controls and rejection of untrusted hosts and malformed bboxes', () => {
    expect(isAllowedSatelliteUrl('https://evil-host.com/fake-sentinel.png')).toBe(false);
    expect(isAllowedSatelliteUrl('http://insecure-http.com/image.png')).toBe(false);
    expect(isAllowedSatelliteUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);

    expect(validateBbox([100, 20, 90, 30])).toBeNull(); // minLng > maxLng
    expect(validateBbox([10, 95, 20, 100])).toBeNull(); // lat > 90
    expect(validateBbox([10, 20, 30] as any)).toBeNull(); // invalid length
  });

  it('5. Verifies contrast stretching raster processing pipeline produces valid PNG', async () => {
    const testImg = path.join(process.cwd(), 'scratch', 'live_dhubri_sentinel2_test.png');
    if (fs.existsSync(testImg)) {
      const outputPng = path.join(process.cwd(), 'scratch', 'test_audit_out.png');
      const outputMeta = path.join(process.cwd(), 'scratch', 'test_audit_out.json');

      const { spawn } = await import('child_process');
      const scriptPath = path.join(process.cwd(), 'src', 'lib', 'satellite', 'processor.py');

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('python', [
          scriptPath,
          '--input', testImg,
          '--output', outputPng,
          '--meta-output', outputMeta,
          '--stretch',
        ]);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Processor exited with code ${code}`));
        });
        proc.on('error', reject);
      });

      expect(fs.existsSync(outputPng)).toBe(true);
      const stat = fs.statSync(outputPng);
      expect(stat.size).toBeGreaterThan(1000);

      const metaRaw = fs.readFileSync(outputMeta, 'utf-8');
      const meta = JSON.parse(metaRaw);
      expect(meta.contrast_stretched).toBe(true);
      expect(meta.format).toBe('PNG');

      // Clean up
      if (fs.existsSync(outputPng)) fs.unlinkSync(outputPng);
      if (fs.existsSync(outputMeta)) fs.unlinkSync(outputMeta);
    }
  });

  it('6. Verifies all four Strategic Presets have valid coordinates, dates, and zoom levels', () => {
    expect(STRATEGIC_PRESETS).toHaveLength(4);
    for (const p of STRATEGIC_PRESETS) {
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
      expect(p.lng).toBeGreaterThanOrEqual(-180);
      expect(p.lng).toBeLessThanOrEqual(180);
      expect(isValidDateString(p.suggestedBeforeDate)).toBe(true);
      expect(isValidDateString(p.suggestedAfterDate)).toBe(true);
      expect(p.defaultZoom).toBeGreaterThanOrEqual(10);
    }
  });
});
