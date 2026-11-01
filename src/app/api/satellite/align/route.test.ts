import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import path from 'path';

describe('API Route: POST /api/satellite/align', () => {
  const realS2Path = path.join(process.cwd(), 'scratch', 'live_dhubri_sentinel2_test.png');
  const realS1Path = path.join(process.cwd(), 'scratch', 'live_dhubri_sentinel1_test.png');

  it('rejects missing parameters with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/satellite/align', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('mandatory');
  });

  it('executes real raster co-registration and returns quality metrics and common grid', async () => {
    const req = new NextRequest('http://localhost:3000/api/satellite/align', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beforePath: realS2Path,
        afterPath: realS1Path,
        aoiBbox: [89.9, 25.95, 90.05, 26.08],
        beforeSensor: 'Sentinel-2',
        afterSensor: 'Sentinel-1 SAR',
        gridSize: 320,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('success');
    expect(['GOOD', 'ACCEPTABLE', 'POOR', 'FAILED']).toContain(data.quality_status);
    expect(data.metrics).toBeDefined();
    expect(data.metrics.displacement_meters).toBeDefined();
    expect(data.metrics.rmse_pixels).toBeDefined();
    expect(data.metrics.rmse_meters).toBeDefined();
    expect(data.grid.target_crs).toContain('EPSG:');
    expect(data.grid.common_gsd_meters).toBe(10.0);
    expect(data.alignedBeforeUrl).toBeDefined();
    expect(data.alignedAfterUrl).toBeDefined();
  });
});
