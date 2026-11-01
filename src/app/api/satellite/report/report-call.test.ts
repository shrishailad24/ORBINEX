import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('POST /api/satellite/report endpoint', () => {
  it('generates a real PDF when called with chat action data', async () => {
    const req = new NextRequest('http://localhost:3000/api/satellite/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aoi: {
          name: 'Amazon River',
          lat: -3.46,
          lng: -62.21,
          bbox: [-62.26, -3.51, -62.17, -3.42],
          areaKm2: 100,
        },
        beforeObservation: {
          sceneId: 'S2A_HISTORICAL_BASELINE',
          datetime: '2020-03-11',
          platform: 'Copernicus Sentinel-2 Optical (10m)',
          imageUrl: '/api/satellite/asset?url=https%3A%2F%2Fservices.arcgisonline.com%2Farcgis%2Frest%2Fservices%2FWorld_Imagery%2FMapServer%2Fexport%3Fbbox%3D-62.26%2C-3.51%2C-62.17%2C-3.42%26bboxSR%3D4326%26size%3D640%2C640%26f%3Dimage',
          cloudCover: 5.0,
        },
        afterObservation: {
          sceneId: 'S2B_CONTEMPORARY_PASS',
          datetime: '2024-03-05',
          platform: 'Copernicus Sentinel-2 Optical (10m)',
          imageUrl: '/api/satellite/asset?url=https%3A%2F%2Fservices.arcgisonline.com%2Farcgis%2Frest%2Fservices%2FWorld_Imagery%2FMapServer%2Fexport%3Fbbox%3D-62.26%2C-3.51%2C-62.17%2C-3.42%26bboxSR%3D4326%26size%3D640%2C640%26f%3Dimage',
          cloudCover: 1.5,
        },
        changeAnalysis: {
          total_change_pct: 14.8,
          changed_area_km2: 14.8,
          metrics: {
            vegetation_loss_pct: 6.2,
            vegetation_loss_km2: 6.2,
            vegetation_gain_pct: 2.1,
            water_shift_pct: 1.8,
            water_shift_km2: 1.8,
            builtup_disturbance_pct: 4.7,
            builtup_disturbance_km2: 4.7,
          },
          summary: 'Multi-temporal observation over Amazon River.',
          confidence_pct: 92,
        },
        aiFindings: {
          executiveSummary: 'Multi-temporal Earth observation over Amazon River.',
          strategicImplications: 'Surface reflectance variance indicates land transition.',
        },
      }),
    });

    const res = await POST(req);
    console.log('REPORT RES STATUS:', res.status);
    if (res.status !== 200) {
      const err = await res.json();
      console.error('REPORT ERROR:', err);
    }
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(5000);
  });
});
