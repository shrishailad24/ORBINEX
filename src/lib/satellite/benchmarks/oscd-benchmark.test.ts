import { describe, it, expect } from 'vitest';
import {
  OSCD_SCENE_ROSTER,
  evaluatePredictionsAgainstGroundTruth,
  computeChangeMetrics,
  executeOscdTestSplitBenchmark,
} from './oscd-benchmark';

describe('ORBINEX — OSCD (Onera Satellite Change Detection) Benchmark Suite', () => {
  describe('1. Dataset Structure & Geographic Train/Test Split', () => {
    it('contains exactly 24 global metropolitan scenes with 14 train / 10 test split', () => {
      expect(OSCD_SCENE_ROSTER.length).toBe(24);
      const trainScenes = OSCD_SCENE_ROSTER.filter((s) => s.split === 'train');
      const testScenes = OSCD_SCENE_ROSTER.filter((s) => s.split === 'test');

      expect(trainScenes.length).toBe(14);
      expect(testScenes.length).toBe(10);
    });

    it('enforces strict geographic scene-level isolation with zero overlapping scenes', () => {
      const trainNames = new Set(OSCD_SCENE_ROSTER.filter((s) => s.split === 'train').map((s) => s.sceneName));
      const testNames = new Set(OSCD_SCENE_ROSTER.filter((s) => s.split === 'test').map((s) => s.sceneName));

      for (const name of testNames) {
        expect(trainNames.has(name)).toBe(false);
      }
    });

    it('includes diverse geographic regions across continents', () => {
      const continents = new Set(OSCD_SCENE_ROSTER.map((s) => s.continent));
      expect(continents.has('Asia')).toBe(true);
      expect(continents.has('Europe')).toBe(true);
      expect(continents.has('North America')).toBe(true);
      expect(continents.has('South America')).toBe(true);
    });
  });

  describe('2. Confusion Matrix & Change Metric Evaluation', () => {
    it('correctly calculates TP, FP, FN, TN from binary arrays', () => {
      const pred = new Uint8Array([1, 1, 0, 0, 1]);
      const gt = new Uint8Array([1, 0, 1, 0, 1]);

      const cm = evaluatePredictionsAgainstGroundTruth(pred, gt);
      expect(cm.tp).toBe(2); // indices 0, 4
      expect(cm.fp).toBe(1); // index 1
      expect(cm.fn).toBe(1); // index 2
      expect(cm.tn).toBe(1); // index 3
      expect(cm.totalPixels).toBe(5);
    });

    it('accurately computes IoU, F1 score, precision, recall, and false alarm rate', () => {
      // 100 TP, 20 FP, 30 FN, 850 TN -> Total = 1000
      const cm = {
        tp: 100,
        fp: 20,
        fn: 30,
        tn: 850,
        totalPixels: 1000,
      };

      const metrics = computeChangeMetrics(cm);

      // Precision: 100 / 120 = 0.8333
      expect(metrics.precision).toBeCloseTo(0.8333, 3);

      // Recall: 100 / 130 = 0.7692
      expect(metrics.recall).toBeCloseTo(0.7692, 3);

      // IoU: 100 / (100 + 20 + 30) = 100 / 150 = 0.6667
      expect(metrics.iou).toBeCloseTo(0.6667, 3);

      // F1: 2 * (0.8333 * 0.7692) / (0.8333 + 0.7692) = 0.8000
      expect(metrics.f1Score).toBeCloseTo(0.8000, 3);

      // False Alarm Rate (FAR): FP / (FP + TN) = 20 / 870 = 0.02298
      expect(metrics.falseAlarmRate).toBeCloseTo(0.023, 2);

      // Overall Accuracy: (100 + 850) / 1000 = 0.9500
      expect(metrics.overallAccuracy).toBe(0.95);

      // Class prevalence: (100 + 30) / 1000 = 13.0%
      expect(metrics.prevalencePct).toBe(13.0);
    });

    it('guards against division by zero when predictions or ground-truth are empty', () => {
      const cm = { tp: 0, fp: 0, fn: 0, tn: 1000, totalPixels: 1000 };
      const metrics = computeChangeMetrics(cm);

      expect(metrics.iou).toBe(0);
      expect(metrics.f1Score).toBe(0);
      expect(metrics.precision).toBe(0);
      expect(metrics.recall).toBe(0);
      expect(metrics.overallAccuracy).toBe(1.0);
    });
  });

  describe('3. Benchmark Execution Pipeline & LEVIR-CD Separation', () => {
    it('executes full OSCD test split benchmark and produces aggregate metrics', () => {
      const result = executeOscdTestSplitBenchmark();

      expect(result.benchmarkName).toBe('OSCD (Onera Satellite Change Detection)');
      expect(result.sensor).toContain('Sentinel-2');
      expect(result.totalScenesEvaluated).toBe(10);
      expect(result.trainSceneCount).toBe(14);
      expect(result.aggregateMetrics.iou).toBeGreaterThan(0.40);
      expect(result.aggregateMetrics.overallAccuracy).toBeGreaterThan(0.90);
      expect(result.status).toBe('VERIFIED_BENCHMARK_COMPLETE');
    });

    it('enforces strict separation notice from LEVIR-CD building change dataset', () => {
      const result = executeOscdTestSplitBenchmark();
      expect(result.levirCdSeparationNotice).toContain('LEVIR-CD');
      expect(result.levirCdSeparationNotice).toContain('0.5m');
      expect(result.levirCdSeparationNotice).toContain('NOT combined');
    });
  });
});
