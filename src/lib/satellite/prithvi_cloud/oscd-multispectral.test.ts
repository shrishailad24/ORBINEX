import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('ORBINEX AI-08B1 — Authentic Multispectral OSCD Data Readiness', () => {
  const manifestPath = path.join(__dirname, 'oscd_multispectral_manifest.json');

  it('1. Verifies authentic multispectral manifest exists and parses valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(content.manifest_schema_version).toBe('1.0.0');
    expect(content.dataset_name).toContain('Onera Satellite Change Detection');
  });

  it('2. Verifies strict 6-band multispectral configuration matching Prithvi HLS V2', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const bands = content.required_bands.map((b: any) => b.band_name);
    expect(bands).toEqual(['B02', 'B03', 'B04', 'B8A', 'B11', 'B12']);

    // Check individual roles and resolutions
    expect(content.required_bands[0]).toMatchObject({ band_name: 'B02', native_gsd_m: 10 });
    expect(content.required_bands[3]).toMatchObject({ band_name: 'B8A', native_gsd_m: 20 });
    expect(content.required_bands[4]).toMatchObject({ band_name: 'B11', native_gsd_m: 20 });
    expect(content.required_bands[5]).toMatchObject({ band_name: 'B12', native_gsd_m: 20 });
  });

  it('3. Verifies official 24-scene roster with exact 14 train / 10 test canonical split', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(content.scenes.length).toBe(24);

    const train = content.scenes.filter((s: any) => s.canonical_split === 'train');
    const test = content.scenes.filter((s: any) => s.canonical_split === 'test');
    expect(train.length).toBe(14);
    expect(test.length).toBe(10);

    // Verify physical pixel totals
    const trainPixels = train.reduce((acc: number, s: any) => acc + s.total_pixels, 0);
    const testPixels = test.reduce((acc: number, s: any) => acc + s.total_pixels, 0);
    expect(trainPixels).toBe(6517578);
    expect(testPixels).toBe(3077936);
  });

  it('4. Enforces zero data leakage between train and test scene sets', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const trainNames = new Set(content.scenes.filter((s: any) => s.canonical_split === 'train').map((s: any) => s.scene_id));
    const testNames = new Set(content.scenes.filter((s: any) => s.canonical_split === 'test').map((s: any) => s.scene_id));

    for (const name of testNames) {
      expect(trainNames.has(name)).toBe(false);
    }
  });

  it('5. Verifies spatially blocked test protocol excludes saclay_w (9 scenes, 2,638,304 px)', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const blocked = content.scenes.filter((s: any) => s.spatially_blocked_split === 'test_independent');
    const excluded = content.scenes.filter((s: any) => s.spatially_blocked_split === 'excluded_due_to_leakage');

    expect(blocked.length).toBe(9);
    expect(excluded.length).toBe(1);
    expect(excluded[0].scene_id).toBe('saclay_w');

    const blockedPixels = blocked.reduce((acc: number, s: any) => acc + s.total_pixels, 0);
    expect(blockedPixels).toBe(2638304);
  });

  it('6. Verifies NASA-IBM Prithvi official normalization parameters', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const pre = content.preprocessing_parameters;

    expect(pre.normalization_mean).toEqual([0.1087, 0.1342, 0.1433, 0.2734, 0.1958, 0.1363]);
    expect(pre.normalization_std).toEqual([0.2248, 0.2179, 0.2178, 0.1850, 0.1242, 0.1049]);
    expect(pre.radiometric_scaling).toBe('DN / 10000.0');
  });

  it('7. Executes Python manifest validation script with 100% exit code 0', () => {
    const scriptPath = path.join(__dirname, 'validate_multispectral_manifest.py');
    const output = execSync(`python "${scriptPath}"`, { encoding: 'utf-8' });
    expect(output).toContain('ALL MULTISPECTRAL MANIFEST CHECKS PASSED SUCCESSFULLY');
  });
});
