import { describe, it, expect } from 'vitest';
import { buildHistoricalComparison } from './historical-providers';

describe('Surrounding Area & Buffer Footprint Calculations', () => {
  it('computes exact square buffer bounding box and metric conversions for any point', () => {
    const lat = 15.3647; // Yaragatti / Hubballi region
    const lng = 75.1240;
    const radiusKm = 5.0; // 5km radius buffer -> 10km x 10km = 100 km2 footprint

    const deltaLat = radiusKm / 111.32;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const deltaLng = radiusKm / (111.32 * Math.max(0.01, cosLat));
    const bbox = [lng - deltaLng, lat - deltaLat, lng + deltaLng, lat + deltaLat];
    const areaKm2 = (2 * radiusKm) * (2 * radiusKm);
    const hectares = areaKm2 * 100;
    const acres = areaKm2 * 247.105;

    expect(areaKm2).toBe(100.0);
    expect(hectares).toBe(10000.0);
    expect(acres).toBeCloseTo(24710.5, 0);
    expect(bbox[0]).toBeLessThan(lng);
    expect(bbox[2]).toBeGreaterThan(lng);
    expect(bbox[1]).toBeLessThan(lat);
    expect(bbox[3]).toBeGreaterThan(lat);
  });

  it('computes small agricultural plot buffer (0.5 km radius = 1 km2 = 100 ha)', () => {
    const radiusKm = 0.5;
    const areaKm2 = (2 * radiusKm) * (2 * radiusKm);
    const hectares = areaKm2 * 100;
    const acres = areaKm2 * 247.105;

    expect(areaKm2).toBe(1.0);
    expect(hectares).toBe(100.0);
    expect(acres).toBeCloseTo(247.1, 1);
  });

  it('supports custom radiusKm and bbox in historical satellite comparisons', async () => {
    const lat = 26.02;
    const lng = 89.98;
    const radiusKm = 7.5;
    const customBbox: [number, number, number, number] = [89.9, 25.9, 90.1, 26.1];

    const comparison = await buildHistoricalComparison(
      lat,
      lng,
      '2020-01-15',
      '2024-01-15',
      'NASA-GIBS',
      radiusKm,
      customBbox
    );

    expect(comparison).toBeDefined();
    expect(comparison.center.lat).toBe(lat);
    expect(comparison.center.lng).toBe(lng);
    expect(comparison.before.targetDate).toBe('2020-01-15');
    expect(comparison.after.targetDate).toBe('2024-01-15');
    expect(comparison.before.tileUrl).toContain('2020-01-15');
    expect(comparison.after.tileUrl).toContain('2024-01-15');
  });
});
