import { describe, it, expect } from 'vitest';
import {
  PRITHVI_NORMALIZATION_STATS,
  constructPrithviInputCube,
  runPrithviInference,
} from './prithvi-foundation';
import type { ExtractedBandRaster } from './cog-reader';

describe('ORBINEX AI-07 — IBM-NASA Prithvi-EO-2.0 Earth Foundation Model Adapter', () => {
  describe('1. Pretrained 6-Band Input Specification & Normalization', () => {
    it('enforces exact canonical 6-band ordering: Blue, Green, Red, Narrow NIR, SWIR1, SWIR2', () => {
      const expectedBands = ['B02', 'B03', 'B04', 'B8A', 'B11', 'B12'];
      expect(PRITHVI_NORMALIZATION_STATS.bands).toEqual(expectedBands);
    });

    it('contains valid HLS V2 surface reflectance mean and standard deviation for all 6 bands', () => {
      expect(PRITHVI_NORMALIZATION_STATS.means.length).toBe(6);
      expect(PRITHVI_NORMALIZATION_STATS.stds.length).toBe(6);

      // Mean surface reflectance values are strictly positive
      for (const m of PRITHVI_NORMALIZATION_STATS.means) {
        expect(m).toBeGreaterThan(0.0);
        expect(m).toBeLessThan(0.4);
      }

      // Standard deviations are strictly positive non-zero
      for (const s of PRITHVI_NORMALIZATION_STATS.stds) {
        expect(s).toBeGreaterThan(0.01);
      }
    });
  });

  describe('2. Bitemporal Input Cube Construction', () => {
    const createMockBand = (bandId: string, val: number, size = 64): ExtractedBandRaster => ({
      bandId,
      commonName: 'test',
      nativeResolutionMeters: 10,
      width: size,
      height: size,
      data: new Float32Array(size * size).fill(val),
      validMask: new Uint8Array(size * size).fill(1),
      minReflectance: val,
      maxReflectance: val,
      meanReflectance: val,
      validPixelCount: size * size,
      totalPixelCount: size * size,
    });

    it('constructs standardized [T=2, C=6, H, W] bitemporal tensor from multi-band rasters', () => {
      const beforeBands: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.05),
        B03: createMockBand('B03', 0.08),
        B04: createMockBand('B04', 0.07),
        B8A: createMockBand('B8A', 0.35),
        B11: createMockBand('B11', 0.20),
        B12: createMockBand('B12', 0.12),
      };

      const afterBands: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.06),
        B03: createMockBand('B03', 0.09),
        B04: createMockBand('B04', 0.14), // Increase in Red (veg loss)
        B8A: createMockBand('B8A', 0.18), // Decrease in NIR
        B11: createMockBand('B11', 0.25),
        B12: createMockBand('B12', 0.18),
      };

      const cube = constructPrithviInputCube(beforeBands, afterBands, 64, 64);

      expect(cube.temporalEpochs).toBe(2);
      expect(cube.bandsPerEpoch).toBe(6);
      expect(cube.height).toBe(64);
      expect(cube.width).toBe(64);
      expect(cube.beforeBands.length).toBe(6);
      expect(cube.afterBands.length).toBe(6);
      expect(cube.beforeBands[0].length).toBe(64 * 64);
    });

    it('throws error if any required canonical band is missing', () => {
      const incompleteBefore: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.05),
        // Missing B03, B04, B8A, B11, B12
      };
      const afterBands: Record<string, ExtractedBandRaster> = {};

      expect(() => constructPrithviInputCube(incompleteBefore, afterBands, 64, 64)).toThrow(
        /Missing required Prithvi input band/
      );
    });
  });

  describe('3. Spatiotemporal Inference & Downstream Task Head Integration', () => {
    it('executes Prithvi-EO-2.0-300M inference and outputs 1024-dimensional embeddings', async () => {
      const createMockBand = (bandId: string, val: number, size = 32): ExtractedBandRaster => ({
        bandId,
        commonName: 'test',
        nativeResolutionMeters: 10,
        width: size,
        height: size,
        data: new Float32Array(size * size).fill(val),
        validMask: new Uint8Array(size * size).fill(1),
        minReflectance: val,
        maxReflectance: val,
        meanReflectance: val,
        validPixelCount: size * size,
        totalPixelCount: size * size,
      });

      const beforeBands: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.04),
        B03: createMockBand('B03', 0.07),
        B04: createMockBand('B04', 0.06),
        B8A: createMockBand('B8A', 0.38),
        B11: createMockBand('B11', 0.19),
        B12: createMockBand('B12', 0.11),
      };

      const afterBands: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.06),
        B03: createMockBand('B03', 0.09),
        B04: createMockBand('B04', 0.16),
        B8A: createMockBand('B8A', 0.15),
        B11: createMockBand('B11', 0.28),
        B12: createMockBand('B12', 0.20),
      };

      const cube = constructPrithviInputCube(beforeBands, afterBands, 32, 32);
      const result = await runPrithviInference(cube, 'Prithvi-EO-2.0-300M');

      expect(result.modelVariant).toBe('Prithvi-EO-2.0-300M');
      expect(result.embeddingDim).toBe(1024);
      expect(result.downstreamHeadType).toContain('TerraTorch');
      expect(result.metrics.meanChangeConfidence).toBeGreaterThan(0.0);
      expect(result.metrics.meanChangeConfidence).toBeLessThanOrEqual(1.0);
      expect(result.changeMask.length).toBe(32 * 32);
      expect(result.device).toBe('cpu');
    });

    it('accurately configures Prithvi-EO-2.0-600M variant with 1536-dimensional embeddings', async () => {
      const createMockBand = (bandId: string, val: number, size = 16): ExtractedBandRaster => ({
        bandId,
        commonName: 'test',
        nativeResolutionMeters: 10,
        width: size,
        height: size,
        data: new Float32Array(size * size).fill(val),
        validMask: new Uint8Array(size * size).fill(1),
        minReflectance: val,
        maxReflectance: val,
        meanReflectance: val,
        validPixelCount: size * size,
        totalPixelCount: size * size,
      });

      const beforeBands: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.05),
        B03: createMockBand('B03', 0.05),
        B04: createMockBand('B04', 0.05),
        B8A: createMockBand('B8A', 0.30),
        B11: createMockBand('B11', 0.15),
        B12: createMockBand('B12', 0.10),
      };

      const afterBands: Record<string, ExtractedBandRaster> = {
        B02: createMockBand('B02', 0.05),
        B03: createMockBand('B03', 0.05),
        B04: createMockBand('B04', 0.05),
        B8A: createMockBand('B8A', 0.30),
        B11: createMockBand('B11', 0.15),
        B12: createMockBand('B12', 0.10),
      };

      const cube = constructPrithviInputCube(beforeBands, afterBands, 16, 16);
      const result = await runPrithviInference(cube, 'Prithvi-EO-2.0-600M');

      expect(result.modelVariant).toBe('Prithvi-EO-2.0-600M');
      expect(result.embeddingDim).toBe(1536);
      // Identical inputs should result in low change probability
      expect(result.metrics.changedAreaPct).toBeLessThan(35);
    });
  });
});
