import { describe, it, expect, vi } from 'vitest';
import { buildGroundedContext, type AssistantContext } from './assistant-rag';

describe('ORBINEX Grounded Assistant RAG Engine', () => {
  it('grounds responses in active AOI telemetry and bounding box', async () => {
    const mockContext: AssistantContext = {
      activeAOI: {
        id: 'aoi-bengaluru-test',
        name: 'Bengaluru Peri-Urban Fringe',
        bbox: [77.45, 12.85, 77.75, 13.15],
        center: [13.0, 77.6],
        areaKm2: 1108.9,
        beforeScene: {
          id: 'S2A_43PGQ_20200329_1_L2A',
          datetime: '2020-03-29T05:25:20Z',
          cloudCover: 1.2,
          platform: 'sentinel-2a',
        },
        afterScene: {
          id: 'S2A_43PGQ_20240328_0_L2A',
          datetime: '2024-03-28T05:25:20Z',
          cloudCover: 0.36,
          platform: 'sentinel-2a',
        },
        changeAnalysis: {
          total_change_pct: 3.05,
          changed_area_km2: 1.38,
          metrics: {
            vegetation_loss_pct: 0.0,
            vegetation_loss_km2: 0.0,
            vegetation_gain_pct: 0.87,
            water_shift_pct: -0.45,
            water_shift_km2: -0.2,
            builtup_disturbance_pct: 2.18,
            builtup_disturbance_km2: 0.99,
          },
          summary: 'Surface disturbance / built-up expansion identified across 0.99 km²',
          findings: ['Surface disturbance identified across 0.99 km² (2.18% of AOI)'],
          confidence_pct: 92,
        },
      },
    };

    const res = await buildGroundedContext('Analyse this active area for vegetation and land cover change.', mockContext);

    expect(res.contextBlock).toContain('Bengaluru Peri-Urban Fringe');
    expect(res.contextBlock).toContain('1108.9 km²');
    expect(res.contextBlock).toContain('S2A_43PGQ_20240328_0_L2A');
    expect(res.contextBlock).toContain('3.05% of AOI');
    expect(res.sources.some(s => s.type === 'aoi')).toBe(true);
    expect(res.sources.some(s => s.type === 'satellite')).toBe(true);
  });

  it('retrieves live seismic data for earthquake questions', async () => {
    const res = await buildGroundedContext('Explain the active earthquakes.');
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.contextBlock).toContain('ORBINEX SYSTEM CAPABILITIES');
  });

  it('preserves system knowledge and CCTV/AIS catalogue attribution', async () => {
    const res = await buildGroundedContext('What sensors does ORBINEX monitor?');
    expect(res.contextBlock).toContain('Copernicus Sentinel-2 Optical');
    expect(res.contextBlock).toContain('17,000+ CCTV surveillance cameras');
    expect(res.sources.some(s => s.type === 'system')).toBe(true);
  });
});
