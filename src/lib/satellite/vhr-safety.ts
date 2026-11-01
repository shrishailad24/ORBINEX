/**
 * ORBINEX — Commercial VHR Order & Tasking Safety Interlock (AI-04)
 * Enforces mandatory human-confirmation boundaries and prevents automated billing runaway (RSK-09).
 */

import { calculateVhrQuote, type VhrQuoteRequest, type VhrQuoteResult, VHR_CATALOG } from './vhr-pricing';
import { isAllowedSatelliteUrl } from './security';

export interface CommercialOrderRequest {
  providerId: 'airbus-neo' | 'planet-skysat' | 'maxar-worldview';
  areaKm2: number;
  bbox?: [number, number, number, number];
  orderType?: 'archive' | 'fresh_tasking';
  licensing?: 'Single-User' | 'Multi-User' | 'Enterprise-Web';
  priority?: 'standard' | 'rush';
  humanApprovalSigned: boolean;
  signedByAnalyst?: string;
  authorizationReason?: string;
}

export interface CommercialSafetyInterlock {
  automatedBillingPrevented: true;
  backgroundTaskingPrevented: true;
  requiresExecutiveAuthorization: true;
  auditLogTimestamp: string;
}

export interface CommercialOrderResponse {
  success: boolean;
  status: 'HUMAN_CONFIRMATION_REQUIRED' | 'SAFEGUARD_LOCKED' | 'INVALID_REQUEST';
  message: string;
  quote?: VhrQuoteResult;
  safetyInterlock: CommercialSafetyInterlock;
  dossierSummary?: {
    providerName: string;
    constellation: string;
    resolutionClass: string;
    billableAreaKm2: number;
    totalUsd: number;
    deliveryEstimateHours: number;
  };
}

/**
 * Enforces the strict human-confirmation boundary for commercial purchases.
 * By mandate, actual purchase and tasking execution are locked against automated triggering.
 */
export function evaluateCommercialOrderSafety(req: CommercialOrderRequest): CommercialOrderResponse {
  const baseInterlock: CommercialSafetyInterlock = {
    automatedBillingPrevented: true,
    backgroundTaskingPrevented: true,
    requiresExecutiveAuthorization: true,
    auditLogTimestamp: new Date().toISOString(),
  };

  if (!req.providerId || !VHR_CATALOG[req.providerId]) {
    return {
      success: false,
      status: 'INVALID_REQUEST',
      message: `Invalid or unrecognized commercial provider: "${req.providerId}". Must be one of: airbus-neo, planet-skysat, maxar-worldview.`,
      safetyInterlock: baseInterlock,
    };
  }

  if (!req.areaKm2 || req.areaKm2 <= 0) {
    return {
      success: false,
      status: 'INVALID_REQUEST',
      message: 'Valid positive area in square kilometers is required for commercial quoting and ordering.',
      safetyInterlock: baseInterlock,
    };
  }

  const quote = calculateVhrQuote({
    providerId: req.providerId,
    areaKm2: req.areaKm2,
    orderType: req.orderType || 'archive',
    licensing: req.licensing || 'Single-User',
    priority: req.priority || 'standard',
  });

  // Mandatory Protocol: Reject any automated request without explicit human confirmation signature
  if (!req.humanApprovalSigned) {
    return {
      success: false,
      status: 'HUMAN_CONFIRMATION_REQUIRED',
      message: 'COMMERCIAL ORDER SAFEGUARD (RSK-09): Explicit human authorization is required. The platform strictly prohibits automated background orders, billing, or satellite tasking.',
      quote,
      safetyInterlock: baseInterlock,
    };
  }

  // Mandatory Protocol: Actual purchase and tasking execution remain disabled in the software
  // to protect against unexpected commercial billing runaway.
  return {
    success: true,
    status: 'SAFEGUARD_LOCKED',
    message: 'ORDER AUTHORIZATION VERIFIED: Commercial acquisition parameters and quote dossier successfully prepared. In accordance with ORBINEX AI-04 safety governance, live satellite tasking and payment execution are locked to prevent automated billing. Contact procurement for manual account settlement.',
    quote,
    safetyInterlock: baseInterlock,
    dossierSummary: {
      providerName: quote.provider.name,
      constellation: quote.provider.constellation,
      resolutionClass: `${quote.provider.resolutionGSD * 100}cm VHR`,
      billableAreaKm2: quote.billableAreaKm2,
      totalUsd: quote.totalEstimateUsd,
      deliveryEstimateHours: quote.estimatedDeliveryHours,
    },
  };
}

/**
 * Validates raster asset retrieval permissions and security boundaries.
 */
export interface AssetRetrievalAuthResult {
  authorized: boolean;
  statusCode: number;
  error?: string;
  configuredEnvVar?: string;
  isAllowedUrl: boolean;
}

const AUTHORIZED_COMMERCIAL_HOSTS = [
  'api.oneatlas.airbus.com',
  'data.api.oneatlas.airbus.com',
  'oneatlas.airbus.com',
  'api.planet.com',
  'tiles.planet.com',
  'api.maxar.com',
  'securewatch.digitalglobe.com',
  'ard.maxar.com',
  'earth-search.aws.element84.com',
  'sentinel-cogs.s3.us-west-2.amazonaws.com',
  'landsat-pds.s3.us-west-2.amazonaws.com',
];

export function validateCommercialAssetAuthorization(
  providerId: string,
  assetUrl?: string
): AssetRetrievalAuthResult {
  let envVar = '';
  let keyVal: string | undefined;

  switch (providerId) {
    case 'airbus-oneatlas':
    case 'airbus-neo':
      envVar = 'AIRBUS_API_KEY';
      keyVal = process.env.AIRBUS_API_KEY || process.env.ONEATLAS_API_KEY;
      break;
    case 'planet-data':
    case 'planet-skysat':
      envVar = 'PLANET_API_KEY';
      keyVal = process.env.PLANET_API_KEY;
      break;
    case 'maxar-ard':
    case 'maxar-worldview':
      envVar = 'MAXAR_API_TOKEN';
      keyVal = process.env.MAXAR_API_TOKEN;
      break;
    case 'element84-stac':
    case 'sentinel-2':
    case 'sentinel-1':
    case 'landsat':
      // Open access, no credential required
      return { authorized: true, statusCode: 200, isAllowedUrl: true };
    default:
      return {
        authorized: false,
        statusCode: 400,
        error: `Unknown provider identifier: ${providerId}`,
        isAllowedUrl: false,
      };
  }

  if (!keyVal) {
    return {
      authorized: false,
      statusCode: 401,
      error: `CREDENTIALS_REQUIRED: Commercial provider '${providerId}' requires active server-side authentication. Set ${envVar} to access authorized raster pixels.`,
      configuredEnvVar: envVar,
      isAllowedUrl: false,
    };
  }

  if (assetUrl) {
    try {
      const parsed = new URL(assetUrl);
      const isHostAllowed = AUTHORIZED_COMMERCIAL_HOSTS.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
      ) || isAllowedSatelliteUrl(assetUrl);

      if (!isHostAllowed) {
        return {
          authorized: false,
          statusCode: 403,
          error: `SECURITY_VIOLATION: Asset URL host '${parsed.hostname}' is not in the approved commercial satellite provider allowlist. SSRF blocked.`,
          configuredEnvVar: envVar,
          isAllowedUrl: false,
        };
      }
    } catch {
      return {
        authorized: false,
        statusCode: 400,
        error: 'Invalid asset URL format provided.',
        configuredEnvVar: envVar,
        isAllowedUrl: false,
      };
    }
  }

  return {
    authorized: true,
    statusCode: 200,
    configuredEnvVar: envVar,
    isAllowedUrl: true,
  };
}
