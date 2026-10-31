/**
 * ORBINEX — Base Satellite Provider Adapter Interface
 * Provides common contract and utilities for all Earth Observation satellite connectors.
 */

import {
  type NormalizedSatelliteObservation,
  type ProviderStatus,
  type SatelliteDiscoveryQuery,
} from './types';

export interface SatelliteProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: 'open' | 'commercial';
  readonly nominalGSDMeters: number;

  /**
   * Returns live operational and credential status for the provider.
   */
  getStatus(): Promise<ProviderStatus>;

  /**
   * Discovers available satellite observations for the requested Area of Interest (AOI).
   */
  search(query: SatelliteDiscoveryQuery): Promise<NormalizedSatelliteObservation[]>;
}
