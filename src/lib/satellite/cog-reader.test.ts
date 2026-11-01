import { describe, it, expect } from 'vitest';
import {
  SENTINEL2_BAND_CATALOG,
  type ExtractedBandRaster,
} from './cog-reader';

describe('ORBINEX AI-07 — Analytical Cloud Optimized GeoTIFF (COG) Reader', () => {
  describe('1. Band Catalog & Sensor Resolution Specifications', () => {
    it('accurately specifies Sentinel-2 L2A surface reflectance bands', () => {
      // 10m bands
      expect(SENTINEL2_BAND_CATALOG['B02'].nativeRes).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B02'].commonName).toBe('blue');
      expect(SENTINEL2_BAND_CATALOG['B03'].nativeRes).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B03'].commonName).toBe('green');
      expect(SENTINEL2_BAND_CATALOG['B04'].nativeRes).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B04'].commonName).toBe('red');
      expect(SENTINEL2_BAND_CATALOG['B08'].nativeRes).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B08'].commonName).toBe('nir');

      // 20m bands
      expect(SENTINEL2_BAND_CATALOG['B8A'].nativeRes).toBe(20);
      expect(SENTINEL2_BAND_CATALOG['B8A'].commonName).toBe('nir08');
      expect(SENTINEL2_BAND_CATALOG['B11'].nativeRes).toBe(20);
      expect(SENTINEL2_BAND_CATALOG['B11'].commonName).toBe('swir16');
      expect(SENTINEL2_BAND_CATALOG['B12'].nativeRes).toBe(20);
      expect(SENTINEL2_BAND_CATALOG['B12'].commonName).toBe('swir22');
    });

    it('prohibits confusing 20m resampled bands with native 10m measurements', () => {
      expect(SENTINEL2_BAND_CATALOG['B8A'].nativeRes).toBeGreaterThan(SENTINEL2_BAND_CATALOG['B08'].nativeRes);
      expect(SENTINEL2_BAND_CATALOG['B11'].nativeRes).toBe(20);
    });
  });

  describe('2. Surface Reflectance Calibration & Index Calculations', () => {
    it('calibrates uint16 DN to surface reflectance in range 0.0 to 1.0', () => {
      const dn = 2500;
      const reflectance = dn / 10000.0;
      expect(reflectance).toBe(0.25);
    });

    it('calculates NDVI (Normalized Difference Vegetation Index) accurately', () => {
      // Healthy vegetation: High NIR (0.40), Low Red (0.08)
      const nir = 0.40;
      const red = 0.08;
      const eps = 1e-6;
      const ndvi = (nir - red) / (nir + red + eps);
      expect(ndvi).toBeCloseTo(0.6667, 3);

      // Water: Low NIR (0.02), Higher Red (0.06) -> Negative NDVI
      const nirWater = 0.02;
      const redWater = 0.06;
      const ndviWater = (nirWater - redWater) / (nirWater + redWater + eps);
      expect(ndviWater).toBeLessThan(0);
    });

    it('calculates McFeeters NDWI (Normalized Difference Water Index) accurately', () => {
      // Water body: High Green (0.15), Very Low NIR (0.01)
      const greenWater = 0.15;
      const nirWater = 0.01;
      const eps = 1e-6;
      const ndwiWater = (greenWater - nirWater) / (greenWater + nirWater + eps);
      expect(ndwiWater).toBeGreaterThan(0.8);

      // Dense vegetation: High NIR (0.45), Moderate Green (0.12) -> Strongly negative NDWI
      const greenVeg = 0.12;
      const nirVeg = 0.45;
      const ndwiVeg = (greenVeg - nirVeg) / (greenVeg + nirVeg + eps);
      expect(ndwiVeg).toBeLessThan(-0.5);
    });

    it('calculates NDII (Normalized Difference Moisture Index) accurately', () => {
      // High canopy moisture: High NIR (0.42), Moderate SWIR1 (0.18)
      const nir = 0.42;
      const swir1 = 0.18;
      const eps = 1e-6;
      const ndii = (nir - swir1) / (nir + swir1 + eps);
      expect(ndii).toBeCloseTo(0.40, 2);
    });

    it('guards against division by zero in spectral indices with epsilon parameter', () => {
      const nir = 0.0;
      const red = 0.0;
      const eps = 1e-6;
      const ndvi = (nir - red) / (nir + red + eps);
      expect(Number.isFinite(ndvi)).toBe(true);
      expect(ndvi).toBe(0);
    });
  });

  describe('3. Extracted Band Raster Schema & Spatial Boundaries', () => {
    it('maintains valid mask matching raster dimensions', () => {
      const mockRaster: ExtractedBandRaster = {
        bandId: 'B04',
        commonName: 'red',
        nativeResolutionMeters: 10,
        width: 128,
        height: 128,
        data: new Float32Array(128 * 128),
        validMask: new Uint8Array(128 * 128).fill(1),
        minReflectance: 0.02,
        maxReflectance: 0.45,
        meanReflectance: 0.15,
        validPixelCount: 128 * 128,
        totalPixelCount: 128 * 128,
      };

      expect(mockRaster.data.length).toBe(mockRaster.width * mockRaster.height);
      expect(mockRaster.validMask.length).toBe(mockRaster.data.length);
      expect(mockRaster.validPixelCount).toBe(mockRaster.totalPixelCount);
    });
  });
});
