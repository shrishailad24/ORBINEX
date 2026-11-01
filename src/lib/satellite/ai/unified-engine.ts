/**
 * ORBINEX — Unified Specialist AI Inference Orchestrator
 * Workstream: AI-13 (Unified ORBINEX Intelligence Engine)
 *
 * Coordinates execution across:
 * - AI-07: NASA/IBM Prithvi-EO-2.0 Foundation Model
 * - AI-08: Forest Intelligence Specialist
 * - AI-09: General Change Detection Engine
 * - AI-10: Building Intelligence Specialist
 * - AI-11: Water Intelligence Specialist
 * - AI-12: Land Intelligence Specialist (ESA WorldCover)
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';

export interface SpecialistInferenceRequest {
  beforePathOrUrl: string;
  afterPathOrUrl: string;
  areaKm2?: number;
  bbox?: [number, number, number, number];
  models?: ('all' | 'forest' | 'building' | 'water' | 'land_cover')[];
}

export interface SpecialistInferenceResponse {
  status: 'success' | 'error';
  workstreams_verified: string[];
  total_area_km2: number;
  composite_confidence_pct: number;
  foundation_model: {
    model: string;
    latent_temporal_divergence: number;
    foundation_anomaly_score: number;
    embedding_grid: string;
  };
  specialists: {
    forest: {
      specialist: string;
      alert_level: 'NOMINAL' | 'WARNING' | 'CRITICAL';
      metrics: {
        canopy_loss_pct: number;
        canopy_loss_km2: number;
        canopy_regrowth_pct: number;
        canopy_regrowth_km2: number;
        estimated_biomass_co2e_loss_tons: number;
      };
      interpretation: string;
    };
    building: {
      specialist: string;
      metrics: {
        new_construction_pct: number;
        new_construction_km2: number;
        demolition_pct: number;
        demolition_km2: number;
        estimated_new_structures: number;
      };
      interpretation: string;
    };
    water: {
      specialist: string;
      hydrologic_state: string;
      metrics: {
        water_inundation_pct: number;
        water_inundation_km2: number;
        water_recession_pct: number;
        water_recession_km2: number;
      };
      interpretation: string;
    };
    land_cover: {
      specialist: string;
      baseline_t1_pct: Record<string, number>;
      observation_t2_pct: Record<string, number>;
      net_shift_pct: Record<string, number>;
      interpretation: string;
    };
  };
  geojson_change_vectors: {
    type: 'FeatureCollection';
    bbox: number[];
    features: any[];
  };
}

export async function runSpecialistInference(
  req: SpecialistInferenceRequest
): Promise<SpecialistInferenceResponse> {
  const pythonScript = path.resolve(process.cwd(), 'src', 'lib', 'satellite', 'specialist_ai.py');
  const tempDir = path.join(os.tmpdir(), `orbinex_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  await fs.mkdir(tempDir, { recursive: true });
  const outputJson = path.join(tempDir, 'output.json');

  const bboxArg = (req.bbox || [0, 0, 1, 1]).join(',');
  const areaKm2 = req.areaKm2 || 100.0;

  return new Promise<SpecialistInferenceResponse>((resolve, reject) => {
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(pythonExe, [
      pythonScript,
      '--before', req.beforePathOrUrl,
      '--after', req.afterPathOrUrl,
      '--area-km2', String(areaKm2),
      '--bbox', bboxArg,
      '--output-json', outputJson,
    ]);

    let stderr = '';
    py.stderr.on('data', (d) => { stderr += d.toString(); });

    py.on('close', async (code) => {
      try {
        if (code === 0 && fsSync.existsSync(outputJson)) {
          const raw = await fs.readFile(outputJson, 'utf-8');
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } else {
          reject(new Error(`Specialist AI inference exited with code ${code}: ${stderr}`));
        }
      } catch (err) {
        reject(err);
      } finally {
        fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn Python specialist AI: ${err.message}`));
    });
  });
}
