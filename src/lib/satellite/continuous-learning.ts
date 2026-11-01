/**
 * ORBINEX — Continuous Learning Pipeline & Ground Truth Model Registry
 * Workstream: AI-18 (Continuous Learning Loop & Model Versioning)
 *
 * Implements an analyst-in-the-loop feedback store compatible with DVC/MLflow
 * schemas to version training datasets, track false positives, and refine models.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export interface GroundTruthFeedback {
  id: string;
  timestamp: string;
  analystId?: string;
  aoiBbox: [number, number, number, number];
  predictedCategory: 'forest' | 'building' | 'water' | 'land_cover' | 'general_change';
  verification: 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'BOUNDARY_ADJUSTED' | 'MISSED_DETECTION';
  confidenceScore: number;
  correctedAreaKm2?: number;
  analystNotes?: string;
  modelIdentifier: string;
  datasetVersion: string;
}

export class ContinuousLearningRegistry {
  private feedbackStorePath: string;
  private currentDatasetVersion = 'v1.4.0-rc2';

  constructor() {
    this.feedbackStorePath = path.resolve(process.cwd(), '.cache', 'model-registry', 'ground-truth.jsonl');
  }

  async recordFeedback(feedback: Omit<GroundTruthFeedback, 'id' | 'timestamp' | 'datasetVersion'>): Promise<GroundTruthFeedback> {
    const entry: GroundTruthFeedback = {
      id: `gt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      datasetVersion: this.currentDatasetVersion,
      ...feedback,
    };

    const dir = path.dirname(this.feedbackStorePath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.feedbackStorePath, line, 'utf-8');
    return entry;
  }

  async getFeedbackStats() {
    if (!fsSync.existsSync(this.feedbackStorePath)) {
      return {
        totalFeedbackRecords: 0,
        datasetVersion: this.currentDatasetVersion,
        accuracyRate: 100.0,
        breakdown: {
          TRUE_POSITIVE: 0,
          FALSE_POSITIVE: 0,
          BOUNDARY_ADJUSTED: 0,
          MISSED_DETECTION: 0,
        },
      };
    }

    const content = await fs.readFile(this.feedbackStorePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const breakdown = {
      TRUE_POSITIVE: 0,
      FALSE_POSITIVE: 0,
      BOUNDARY_ADJUSTED: 0,
      MISSED_DETECTION: 0,
    };

    for (const l of lines) {
      try {
        const item: GroundTruthFeedback = JSON.parse(l);
        if (breakdown[item.verification] !== undefined) {
          breakdown[item.verification]++;
        }
      } catch {}
    }

    const total = lines.length;
    const verifiedTrue = breakdown.TRUE_POSITIVE + breakdown.BOUNDARY_ADJUSTED;
    const accuracyRate = total > 0 ? Math.round((verifiedTrue / total) * 1000) / 10 : 100.0;

    return {
      totalFeedbackRecords: total,
      datasetVersion: this.currentDatasetVersion,
      accuracyRate,
      breakdown,
    };
  }
}

export const continuousLearningRegistry = new ContinuousLearningRegistry();
