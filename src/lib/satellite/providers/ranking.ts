/**
 * ORBINEX — Satellite Observation Ranking Engine
 * Evaluates and scores satellite observations across spatial resolution, temporal proximity,
 * cloud coverage, AOI intersection, and licensing availability.
 */

import { type NormalizedSatelliteObservation } from './types';

export function rankObservations(
  observations: NormalizedSatelliteObservation[],
  targetDate?: string,
  isSmallPlot: boolean = false
): NormalizedSatelliteObservation[] {
  const targetEpoch = targetDate ? Date.parse(targetDate) : Date.now();

  const scored = observations.map((obs) => {
    let score = 0;

    // 1. AOI Intersection Coverage (Weight: 25)
    // Full coverage gets full 25 points; partial coverage scaled linearly
    score += (obs.aoiIntersectionPercent / 100) * 25;

    // 2. Spatial Resolution (GSD) (Weight: 30)
    // For small plots (e.g. 2,000 sq ft), high resolution is heavily prioritized
    if (isSmallPlot) {
      if (obs.gsdMeters <= 0.35) score += 35; // 30cm class (Pléiades Neo, WorldView-3)
      else if (obs.gsdMeters <= 0.6) score += 28; // 50cm class (SkySat)
      else if (obs.gsdMeters <= 10) score += 10; // 10m (Sentinel-2)
      else score += 2; // 30m (Landsat)
    } else {
      // For regional monitoring, 10m is standard
      if (obs.gsdMeters <= 10) score += 25;
      else if (obs.gsdMeters <= 0.5) score += 22;
      else score += 15;
    }

    // 3. Temporal Proximity (Weight: 20)
    const obsEpoch = Date.parse(obs.acquisitionDate);
    const dayDiff = Math.abs(obsEpoch - targetEpoch) / (1000 * 60 * 60 * 24);
    if (dayDiff <= 7) score += 20;
    else if (dayDiff <= 30) score += 15;
    else if (dayDiff <= 60) score += 10;
    else score += Math.max(0, 10 - (dayDiff - 60) * 0.1);

    // 4. Cloud Cover Penalty (Weight: 15)
    const cloud = obs.cloudCover ?? 0;
    score += Math.max(0, (100 - cloud) * 0.15);

    // 5. Immediate Analytical Raster Availability (Weight: 10)
    if (obs.isRasterAvailable) {
      score += 10;
    } else {
      // Metadata-only commercial observation
      score += 2;
    }

    return {
      ...obs,
      rankingScore: Number(score.toFixed(1)),
    };
  });

  // Sort descending by rankingScore
  return scored.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
}
