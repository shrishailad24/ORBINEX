import { describe, it, expect } from 'vitest';
import { runSpecialistInference } from './ai/unified-engine';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Phase 3 — Specialist Geospatial AI & Earth Foundation Models (AI-07 to AI-13)', () => {
  it('executes Prithvi-EO-2.0, Forest, Building, Water, and Land Specialists', async () => {
    // Generate two small synthetic test images
    const tempDir = path.join(os.tmpdir(), `phase3_test_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Minimal 32x32 PNGs
    const bPath = path.join(tempDir, 'before.png');
    const aPath = path.join(tempDir, 'after.png');

    // Create simple PNG test buffers
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await fs.writeFile(bPath, validPng);
    await fs.writeFile(aPath, validPng);

    try {
      const result = await runSpecialistInference({
        beforePathOrUrl: bPath,
        afterPathOrUrl: aPath,
        areaKm2: 50.0,
        bbox: [77.5, 12.9, 77.7, 13.1],
      });

      expect(result.status).toBe('success');
      expect(result.workstreams_verified).toContain('AI-07');
      expect(result.workstreams_verified).toContain('AI-08');
      expect(result.workstreams_verified).toContain('AI-10');
      expect(result.workstreams_verified).toContain('AI-11');
      expect(result.workstreams_verified).toContain('AI-12');
      expect(result.workstreams_verified).toContain('AI-13');

      // Verify Prithvi Foundation representation
      expect(result.foundation_model.model).toContain('Prithvi-EO-2.0');
      expect(typeof result.foundation_model.latent_temporal_divergence).toBe('number');

      // Verify Forest Specialist
      expect(result.specialists.forest.specialist).toContain('Forest Intelligence');
      expect(typeof result.specialists.forest.metrics.canopy_loss_pct).toBe('number');

      // Verify Building Specialist
      expect(result.specialists.building.specialist).toContain('Building');
      expect(typeof result.specialists.building.metrics.new_construction_pct).toBe('number');

      // Verify Water Specialist
      expect(result.specialists.water.specialist).toContain('Water');
      expect(typeof result.specialists.water.hydrologic_state).toBe('string');

      // Verify Land Cover Specialist
      expect(result.specialists.land_cover.specialist).toContain('WorldCover');
      expect(typeof result.specialists.land_cover.baseline_t1_pct).toBe('object');

      // Verify GeoJSON FeatureCollection output
      expect(result.geojson_change_vectors.type).toBe('FeatureCollection');
      expect(result.geojson_change_vectors.features.length).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
