/**
 * ═══════════════════════════════════════════════════════════════
 * ORBINEX — Brand & Identity System
 * Centralized brand configuration to ensure consistency across
 * HUD panels, metadata, exports, and document titles.
 * ═══════════════════════════════════════════════════════════════
 */

export const BRAND = {
  name: 'ORBINEX',
  tagline: 'SEE THE WORLD. UNDERSTAND THE CHANGE.',
  description: 'GLOBAL GEOSPATIAL INTELLIGENCE PLATFORM',
  keywords: 'SATELLITE · AI · EARTH · INTELLIGENCE',
  fullTitle: 'ORBINEX — Global Geospatial Intelligence Platform',
  metaDescription:
    'AI-powered global geospatial intelligence platform combining satellite imagery, GIS, real-time monitoring, AI-powered geographical change detection, cameras, global events, and actionable alerts.',
  url: 'https://orbinex.live',
  version: '1.0.0',
  legalNotice:
    'ORBINEX provides objective geospatial observation and remote-sensing analytics. Regulatory and legal statuses require lawful verification by competent authorities.',
  exportPrefix: 'orbinex',
  assets: {
    icon: '/brand/orbinex-icon.svg',
    iconDark: '/brand/orbinex-icon-dark.svg',
    iconLight: '/brand/orbinex-icon-light.svg',
    logoHorizontal: '/brand/orbinex-logo-horizontal.svg',
    logoHorizontalDark: '/brand/orbinex-logo-horizontal-dark.svg',
    logoHorizontalLight: '/brand/orbinex-logo-horizontal-light.svg',
    logoStacked: '/brand/orbinex-logo-stacked.svg',
    logoMonoWhite: '/brand/orbinex-logo-monochrome-white.svg',
    logoMonoBlack: '/brand/orbinex-logo-monochrome-black.svg',
    favicon: '/brand/orbinex-favicon.svg',
    presentationBoard: '/brand/orbinex-brand-presentation.jpg',
  },
} as const;
