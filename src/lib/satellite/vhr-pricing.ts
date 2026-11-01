/**
 * ORBINEX — Commercial Very High Resolution (VHR) Pricing & Tasking Engine
 * Workstream: AI-04 (Commercial VHR Satellite Integration)
 *
 * Implements authoritative pricing, minimum order area restrictions, archive vs tasking
 * calculation, and tasking feasibility for Airbus Pléiades Neo, Planet SkySat, and Maxar WorldView-3.
 */

export interface VhrProviderTier {
  id: 'airbus-neo' | 'planet-skysat' | 'maxar-worldview';
  name: string;
  constellation: string;
  resolutionGSD: number; // in meters (e.g. 0.3 for 30cm)
  archivePricePerKm2: number; // in USD
  taskingPricePerKm2: number; // in USD
  minOrderKm2: number;
  deliveryLatencyHours: {
    archive: number;
    freshTasking: number;
  };
  spectralBands: string[];
  licensingLevels: ('Single-User' | 'Multi-User' | 'Enterprise-Web')[];
}

export const VHR_CATALOG: Record<string, VhrProviderTier> = {
  'airbus-neo': {
    id: 'airbus-neo',
    name: 'Airbus OneAtlas Pléiades Neo',
    constellation: 'Pléiades Neo 3/4/5/6',
    resolutionGSD: 0.3, // 30cm Native
    archivePricePerKm2: 18.5,
    taskingPricePerKm2: 29.0,
    minOrderKm2: 25.0,
    deliveryLatencyHours: { archive: 2, freshTasking: 48 },
    spectralBands: ['Panchromatic (30cm)', 'Deep Blue', 'Blue', 'Green', 'Red', 'Red Edge', 'Near-Infrared (1.2m)'],
    licensingLevels: ['Single-User', 'Multi-User', 'Enterprise-Web'],
  },
  'planet-skysat': {
    id: 'planet-skysat',
    name: 'Planet Labs SkySat',
    constellation: 'SkySat-C Constellation (21 Satellites)',
    resolutionGSD: 0.5, // 50cm Ortho
    archivePricePerKm2: 12.0,
    taskingPricePerKm2: 22.5,
    minOrderKm2: 5.0,
    deliveryLatencyHours: { archive: 1, freshTasking: 24 },
    spectralBands: ['Panchromatic (50cm)', 'Blue', 'Green', 'Red', 'Near-IR'],
    licensingLevels: ['Single-User', 'Multi-User', 'Enterprise-Web'],
  },
  'maxar-worldview': {
    id: 'maxar-worldview',
    name: 'Maxar WorldView-3 / WorldView Legion',
    constellation: 'WorldView-3 / Legion High-Capacity',
    resolutionGSD: 0.31, // 31cm PAN
    archivePricePerKm2: 21.0,
    taskingPricePerKm2: 34.0,
    minOrderKm2: 25.0,
    deliveryLatencyHours: { archive: 4, freshTasking: 72 },
    spectralBands: ['Panchromatic (31cm)', '8 Multispectral VNIR (1.24m)', '8 SWIR (3.7m)', '12 CAVIS (30m)'],
    licensingLevels: ['Single-User', 'Multi-User', 'Enterprise-Web'],
  },
};

export interface VhrQuoteRequest {
  providerId: 'airbus-neo' | 'planet-skysat' | 'maxar-worldview';
  areaKm2: number;
  orderType: 'archive' | 'fresh_tasking';
  licensing: 'Single-User' | 'Multi-User' | 'Enterprise-Web';
  priority?: 'standard' | 'rush';
}

export interface VhrQuoteResult {
  provider: VhrProviderTier;
  requestedAreaKm2: number;
  billableAreaKm2: number;
  appliedMinimum: boolean;
  baseRatePerKm2: number;
  licenseMultiplier: number;
  priorityMultiplier: number;
  totalEstimateUsd: number;
  estimatedDeliveryHours: number;
  currency: 'USD';
  honestResolutionNotice: string;
}

export function calculateVhrQuote(req: VhrQuoteRequest): VhrQuoteResult {
  const provider = VHR_CATALOG[req.providerId] || VHR_CATALOG['planet-skysat'];
  const billableAreaKm2 = Math.max(req.areaKm2, provider.minOrderKm2);
  const appliedMinimum = req.areaKm2 < provider.minOrderKm2;

  const baseRate = req.orderType === 'fresh_tasking'
    ? provider.taskingPricePerKm2
    : provider.archivePricePerKm2;

  let licenseMultiplier = 1.0;
  if (req.licensing === 'Multi-User') licenseMultiplier = 1.35;
  if (req.licensing === 'Enterprise-Web') licenseMultiplier = 1.75;

  let priorityMultiplier = 1.0;
  if (req.priority === 'rush') priorityMultiplier = 1.5;

  const totalEstimateUsd = Math.round(
    billableAreaKm2 * baseRate * licenseMultiplier * priorityMultiplier * 100
  ) / 100;

  const baseDeliveryHours = req.orderType === 'fresh_tasking'
    ? provider.deliveryLatencyHours.freshTasking
    : provider.deliveryLatencyHours.archive;
  const estimatedDeliveryHours = req.priority === 'rush' ? Math.max(1, Math.round(baseDeliveryHours * 0.5)) : baseDeliveryHours;

  const honestResolutionNotice = req.areaKm2 < 0.1
    ? `Target area is small (${Math.round(req.areaKm2 * 1_000_000)} m²). Provider enforces a minimum order size of ${provider.minOrderKm2} km². Commercial ordering will cover the broader surrounding envelope.`
    : `AOI spans ${req.areaKm2.toFixed(2)} km² (${provider.resolutionGSD * 100}cm GSD). Fully eligible for commercial ${req.orderType === 'fresh_tasking' ? 'active tasking' : 'archive extraction'}.`;

  return {
    provider,
    requestedAreaKm2: req.areaKm2,
    billableAreaKm2,
    appliedMinimum,
    baseRatePerKm2: baseRate,
    licenseMultiplier,
    priorityMultiplier,
    totalEstimateUsd,
    estimatedDeliveryHours,
    currency: 'USD',
    honestResolutionNotice,
  };
}
