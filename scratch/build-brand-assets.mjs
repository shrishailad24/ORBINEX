import fs from 'fs';
import path from 'path';

const brandDir = 'C:/Users/shash/Downloads/osiris-master/osiris-master/public/brand';
if (!fs.existsSync(brandDir)) {
  fs.mkdirSync(brandDir, { recursive: true });
}

// ==========================================
// 1. REUSABLE DEF BLOCKS & GLYPH PATHS
// ==========================================

const ICON_DEFS = `
  <defs>
    <!-- Background subtle dark aura for globe -->
    <radialGradient id="globe-bg" cx="38%" cy="32%" r="65%">
      <stop offset="0%" stop-color="#0E3A66"/>
      <stop offset="45%" stop-color="#081E38"/>
      <stop offset="85%" stop-color="#040D1A"/>
      <stop offset="100%" stop-color="#020710"/>
    </radialGradient>

    <!-- Outer 'O' Torus Ring Gradient -->
    <linearGradient id="o-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38E1FF"/>
      <stop offset="30%" stop-color="#00C8F8"/>
      <stop offset="70%" stop-color="#0066E0"/>
      <stop offset="100%" stop-color="#00388A"/>
    </linearGradient>

    <!-- Inner Rim Glow -->
    <linearGradient id="o-inner-rim" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="#0077FF" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#002255" stop-opacity="0"/>
    </linearGradient>

    <!-- Front Orbit Gradient -->
    <linearGradient id="orbit-grad-front" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.2"/>
      <stop offset="35%" stop-color="#00E5FF" stop-opacity="0.95"/>
      <stop offset="75%" stop-color="#70EFFF" stop-opacity="1"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.9"/>
    </linearGradient>

    <!-- Back Orbit Gradient -->
    <linearGradient id="orbit-grad-back" x1="100%" y1="0%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.4"/>
      <stop offset="50%" stop-color="#0077D4" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0055AA" stop-opacity="0.1"/>
    </linearGradient>

    <!-- Sensor Core Glow -->
    <radialGradient id="sensor-beacon" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="35%" stop-color="#55EFFF"/>
      <stop offset="70%" stop-color="#00B8F5" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0055AA" stop-opacity="0"/>
    </radialGradient>
    
    <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>

    <!-- Wordmark Gradients -->
    <linearGradient id="text-white-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#DCE7F5"/>
    </linearGradient>

    <linearGradient id="cyan-accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#55F0FF"/>
      <stop offset="100%" stop-color="#00B4D8"/>
    </linearGradient>
  </defs>
`;

// Helper: Vector mark centered in 200x200 space
const ICON_BODY = `
  <!-- 1. BACK ORBITAL SEGMENT -->
  <g transform="rotate(-25 100 100)">
    <path d="M 12 100 A 88 28 0 0 1 188 100" fill="none" stroke="url(#orbit-grad-back)" stroke-width="2.5" stroke-dasharray="4 3" opacity="0.65"/>
  </g>

  <!-- 2. OUTER STRUCTURAL 'O' RING -->
  <g>
    <!-- Outer Ring Body -->
    <circle cx="100" cy="100" r="76" fill="none" stroke="url(#o-ring-grad)" stroke-width="14" stroke-linecap="round"/>

    <!-- Inner Edge Precision Rim -->
    <circle cx="100" cy="100" r="68" fill="none" stroke="url(#o-inner-rim)" stroke-width="1.8"/>
    
    <!-- Outer Reticle Ticks -->
    <path d="M 100 13 L 100 19 M 100 181 L 100 187 M 13 100 L 19 100 M 181 100 L 187 100" 
          stroke="#00E5FF" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  </g>

  <!-- 3. INNER EARTH GLOBE / GEOSPATIAL SPHERE -->
  <g>
    <!-- Globe Core Sphere -->
    <circle cx="100" cy="100" r="50" fill="url(#globe-bg)"/>
    
    <!-- Atmosphere Glow -->
    <circle cx="100" cy="100" r="50" fill="none" stroke="#00E5FF" stroke-width="1.5" opacity="0.45"/>

    <!-- Latitude lines -->
    <ellipse cx="100" cy="100" rx="50" ry="14" fill="none" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.35"/>
    <ellipse cx="100" cy="82" rx="46" ry="10" fill="none" stroke="#00D2FF" stroke-width="0.75" stroke-opacity="0.25"/>
    <ellipse cx="100" cy="118" rx="46" ry="10" fill="none" stroke="#00D2FF" stroke-width="0.75" stroke-opacity="0.25"/>
    
    <!-- Meridians -->
    <ellipse cx="100" cy="100" rx="22" ry="50" fill="none" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.4"/>
    <line x1="100" y1="50" x2="100" y2="150" stroke="#00E5FF" stroke-width="1.2" stroke-opacity="0.5"/>
    <line x1="50" y1="100" x2="150" y2="100" stroke="#00E5FF" stroke-width="1.2" stroke-opacity="0.5"/>

    <!-- Continents / Sensor Landmass Polygon Grid -->
    <path d="M 82 72 Q 92 68 106 74 Q 116 80 120 90 Q 112 102 102 96 Q 90 98 84 90 Z" 
          fill="#00E5FF" fill-opacity="0.22" stroke="#00E5FF" stroke-width="0.8" stroke-opacity="0.45"/>
    <path d="M 74 105 Q 86 102 92 112 Q 95 125 86 130 Q 76 126 72 116 Z" 
          fill="#00E5FF" fill-opacity="0.18" stroke="#00E5FF" stroke-width="0.8" stroke-opacity="0.4"/>
    <path d="M 115 110 Q 128 108 135 116 Q 138 126 126 128 Z" 
          fill="#00E5FF" fill-opacity="0.20" stroke="#00E5FF" stroke-width="0.8" stroke-opacity="0.4"/>
  </g>

  <!-- 4. FRONT ORBITAL SEGMENT -->
  <g transform="rotate(-25 100 100)">
    <path d="M 188 100 A 88 28 0 0 1 12 100" fill="none" stroke="url(#orbit-grad-front)" stroke-width="3.2" stroke-linecap="round" filter="url(#cyan-glow)"/>

    <!-- Telemetry dots -->
    <circle cx="55" cy="122" r="1.5" fill="#00E5FF" opacity="0.8"/>
    <circle cx="95" cy="128" r="1.5" fill="#00E5FF" opacity="0.9"/>
    <circle cx="140" cy="123" r="1.5" fill="#00E5FF" opacity="0.8"/>

    <!-- Satellite Node -->
    <g transform="translate(176, 90)">
      <circle cx="0" cy="0" r="10" fill="url(#sensor-beacon)" opacity="0.85"/>
      <circle cx="0" cy="0" r="4.5" fill="#00E5FF"/>
      <circle cx="0" cy="0" r="2" fill="#FFFFFF"/>
      <line x1="-8" y1="-3.5" x2="-3.5" y2="-1.5" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="3.5" y1="1.5" x2="8" y2="3.5" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
    </g>
  </g>

  <!-- 5. OPTICAL TARGET RETICLE CORE -->
  <circle cx="100" cy="100" r="3" fill="#FFFFFF"/>
  <circle cx="100" cy="100" r="6" fill="none" stroke="#00E5FF" stroke-width="1" opacity="0.8"/>
`;

// Helper: Pure Monochrome Version of the Icon
const ICON_MONO = (fillColor = '#FFFFFF') => `
  <g transform="rotate(-25 100 100)">
    <path d="M 12 100 A 88 28 0 0 1 188 100" fill="none" stroke="${fillColor}" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
  </g>
  <circle cx="100" cy="100" r="76" fill="none" stroke="${fillColor}" stroke-width="12" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="50" fill="none" stroke="${fillColor}" stroke-width="2"/>
  <ellipse cx="100" cy="100" rx="50" ry="14" fill="none" stroke="${fillColor}" stroke-width="1" stroke-opacity="0.4"/>
  <ellipse cx="100" cy="100" rx="22" ry="50" fill="none" stroke="${fillColor}" stroke-width="1" stroke-opacity="0.4"/>
  <line x1="100" y1="50" x2="100" y2="150" stroke="${fillColor}" stroke-width="1" stroke-opacity="0.5"/>
  <line x1="50" y1="100" x2="150" y2="100" stroke="${fillColor}" stroke-width="1" stroke-opacity="0.5"/>
  <g transform="rotate(-25 100 100)">
    <path d="M 188 100 A 88 28 0 0 1 12 100" fill="none" stroke="${fillColor}" stroke-width="3" stroke-linecap="round"/>
    <g transform="translate(176, 90)">
      <circle cx="0" cy="0" r="4.5" fill="${fillColor}"/>
      <line x1="-8" y1="-3.5" x2="8" y2="3.5" stroke="${fillColor}" stroke-width="1.5" stroke-linecap="round"/>
    </g>
  </g>
  <circle cx="100" cy="100" r="3" fill="${fillColor}"/>
`;

// Wordmark geometric paths (R, B, I, N, E, X)
// Scaled to height 60, starting around Y=70
const WORDMARK_RBINEX = (isDark = true) => {
  const white = isDark ? 'url(#text-white-grad)' : '#0F172A';
  const cyan = 'url(#cyan-accent-grad)';
  const cyanSolid = isDark ? '#00E5FF' : '#0284C7';

  return `
  <!-- R -->
  <g transform="translate(230, 68)">
    <path d="M 0 0 L 32 0 C 44 0 52 7 52 18 C 52 28 45 35 34 37 L 53 62 L 36 62 L 20 40 L 15 40 L 15 62 L 0 62 Z M 15 13 L 15 28 L 30 28 C 36 28 40 25 40 20.5 C 40 16 36 13 30 13 Z" fill="${white}"/>
    <!-- Diagonal Cyan Accent Cut -->
    <polygon points="20,40 36,62 25,62 15,47" fill="${cyanSolid}"/>
  </g>

  <!-- B -->
  <g transform="translate(300, 68)">
    <path d="M 0 0 L 30 0 C 42 0 49 6 49 16 C 49 23 44 28 37 30 C 46 32 51 38 51 47 C 51 57 43 62 30 62 L 0 62 Z M 15 12 L 15 25 L 28 25 C 33 25 36 22 36 18.5 C 36 15 33 12 28 12 Z M 15 37 L 15 50 L 29 50 C 35 50 38 47 38 43.5 C 38 40 35 37 29 37 Z" fill="${white}"/>
  </g>

  <!-- I (with signature angular radar apex) -->
  <g transform="translate(372, 68)">
    <rect x="0" y="16" width="14" height="46" rx="2" fill="${white}"/>
    <!-- Angled Satellite Chevron Apex -->
    <polygon points="0,11 14,0 14,11 0,11" fill="${cyanSolid}"/>
  </g>

  <!-- N -->
  <g transform="translate(406, 68)">
    <path d="M 0 0 L 14 0 L 38 42 L 38 0 L 51 0 L 51 62 L 37 62 L 14 20 L 14 62 L 0 62 Z" fill="${white}"/>
  </g>

  <!-- E (Modern 3-bar precision cut) -->
  <g transform="translate(477, 68)">
    <rect x="0" y="0" width="46" height="13" rx="2" fill="${white}"/>
    <rect x="0" y="24" width="36" height="13" rx="2" fill="${cyanSolid}"/>
    <rect x="0" y="49" width="46" height="13" rx="2" fill="${white}"/>
  </g>

  <!-- X (Symmetric dynamic cross) -->
  <g transform="translate(543, 68)">
    <path d="M 0 0 L 17 0 L 29 19 L 41 0 L 58 0 L 37 31 L 58 62 L 41 62 L 29 43 L 17 62 L 0 62 L 21 31 Z" fill="${white}"/>
    <!-- Cyan facet accent on right arm -->
    <polygon points="29,43 41,62 58,62 37,31" fill="${cyanSolid}" opacity="0.9"/>
  </g>
  `;
};

// Wordmark full ORBINEX (when icon is placed above or separate)
const WORDMARK_FULL = (isDark = true) => {
  const white = isDark ? 'url(#text-white-grad)' : '#0F172A';
  const cyanSolid = isDark ? '#00E5FF' : '#0284C7';

  return `
  <!-- O -->
  <g transform="translate(150, 68)">
    <path d="M 28 0 C 44 0 56 13 56 31 C 56 49 44 62 28 62 C 12 62 0 49 0 31 C 0 13 12 0 28 0 Z M 28 13 C 18 13 14 21 14 31 C 14 41 18 49 28 49 C 38 49 42 41 42 31 C 42 21 38 13 28 13 Z" fill="${white}"/>
    <ellipse cx="28" cy="31" rx="27" ry="9" fill="none" stroke="${cyanSolid}" stroke-width="2.5" transform="rotate(-25 28 31)"/>
  </g>
  <!-- R -->
  <g transform="translate(224, 68)">
    <path d="M 0 0 L 32 0 C 44 0 52 7 52 18 C 52 28 45 35 34 37 L 53 62 L 36 62 L 20 40 L 15 40 L 15 62 L 0 62 Z M 15 13 L 15 28 L 30 28 C 36 28 40 25 40 20.5 C 40 16 36 13 30 13 Z" fill="${white}"/>
    <polygon points="20,40 36,62 25,62 15,47" fill="${cyanSolid}"/>
  </g>
  <!-- B -->
  <g transform="translate(294, 68)">
    <path d="M 0 0 L 30 0 C 42 0 49 6 49 16 C 49 23 44 28 37 30 C 46 32 51 38 51 47 C 51 57 43 62 30 62 L 0 62 Z M 15 12 L 15 25 L 28 25 C 33 25 36 22 36 18.5 C 36 15 33 12 28 12 Z M 15 37 L 15 50 L 29 50 C 35 50 38 47 38 43.5 C 38 40 35 37 29 37 Z" fill="${white}"/>
  </g>
  <!-- I -->
  <g transform="translate(366, 68)">
    <rect x="0" y="16" width="14" height="46" rx="2" fill="${white}"/>
    <polygon points="0,11 14,0 14,11 0,11" fill="${cyanSolid}"/>
  </g>
  <!-- N -->
  <g transform="translate(400, 68)">
    <path d="M 0 0 L 14 0 L 38 42 L 38 0 L 51 0 L 51 62 L 37 62 L 14 20 L 14 62 L 0 62 Z" fill="${white}"/>
  </g>
  <!-- E -->
  <g transform="translate(471, 68)">
    <rect x="0" y="0" width="46" height="13" rx="2" fill="${white}"/>
    <rect x="0" y="24" width="36" height="13" rx="2" fill="${cyanSolid}"/>
    <rect x="0" y="49" width="46" height="13" rx="2" fill="${white}"/>
  </g>
  <!-- X -->
  <g transform="translate(537, 68)">
    <path d="M 0 0 L 17 0 L 29 19 L 41 0 L 58 0 L 37 31 L 58 62 L 41 62 L 29 43 L 17 62 L 0 62 L 21 31 Z" fill="${white}"/>
    <polygon points="29,43 41,62 58,62 37,31" fill="${cyanSolid}" opacity="0.9"/>
  </g>
  `;
};

// Wordmark Monochrome
const WORDMARK_MONO = (fillColor = '#FFFFFF') => `
  <!-- R -->
  <g transform="translate(230, 68)">
    <path d="M 0 0 L 32 0 C 44 0 52 7 52 18 C 52 28 45 35 34 37 L 53 62 L 36 62 L 20 40 L 15 40 L 15 62 L 0 62 Z M 15 13 L 15 28 L 30 28 C 36 28 40 25 40 20.5 C 40 16 36 13 30 13 Z" fill="${fillColor}"/>
  </g>
  <!-- B -->
  <g transform="translate(300, 68)">
    <path d="M 0 0 L 30 0 C 42 0 49 6 49 16 C 49 23 44 28 37 30 C 46 32 51 38 51 47 C 51 57 43 62 30 62 L 0 62 Z M 15 12 L 15 25 L 28 25 C 33 25 36 22 36 18.5 C 36 15 33 12 28 12 Z M 15 37 L 15 50 L 29 50 C 35 50 38 47 38 43.5 C 38 40 35 37 29 37 Z" fill="${fillColor}"/>
  </g>
  <!-- I -->
  <g transform="translate(372, 68)">
    <rect x="0" y="16" width="14" height="46" rx="2" fill="${fillColor}"/>
    <polygon points="0,11 14,0 14,11 0,11" fill="${fillColor}"/>
  </g>
  <!-- N -->
  <g transform="translate(406, 68)">
    <path d="M 0 0 L 14 0 L 38 42 L 38 0 L 51 0 L 51 62 L 37 62 L 14 20 L 14 62 L 0 62 Z" fill="${fillColor}"/>
  </g>
  <!-- E -->
  <g transform="translate(477, 68)">
    <rect x="0" y="0" width="46" height="13" rx="2" fill="${fillColor}"/>
    <rect x="0" y="24" width="36" height="13" rx="2" fill="${fillColor}"/>
    <rect x="0" y="49" width="46" height="13" rx="2" fill="${fillColor}"/>
  </g>
  <!-- X -->
  <g transform="translate(543, 68)">
    <path d="M 0 0 L 17 0 L 29 19 L 41 0 L 58 0 L 37 31 L 58 62 L 41 62 L 29 43 L 17 62 L 0 62 L 21 31 Z" fill="${fillColor}"/>
  </g>
`;

// Tagline helper
const TAGLINE = (isDark = true) => {
  const white = isDark ? '#E2E8F0' : '#334155';
  const cyan = isDark ? '#00E5FF' : '#0284C7';
  return `
  <g transform="translate(230, 155)">
    <text font-family="'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="500" letter-spacing="0.16em">
      <tspan fill="${white}">See the World. </tspan>
      <tspan fill="${cyan}" font-weight="600">Understand the Change.</tspan>
    </text>
  </g>
  `;
};

const TAGLINE_MONO = (fillColor = '#FFFFFF') => `
  <g transform="translate(230, 155)">
    <text font-family="'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="500" letter-spacing="0.16em" fill="${fillColor}" opacity="0.85">
      See the World. Understand the Change.
    </text>
  </g>
`;


// ==========================================
// 2. GENERATE ALL ASSET FILES
// ==========================================

// 1. orbinex-icon.svg (Transparent)
const fileIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  ${ICON_DEFS}
  ${ICON_BODY}
</svg>
`;

// 2. orbinex-icon-dark.svg (On dark tile)
const fileIconDark = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  ${ICON_DEFS}
  <rect width="200" height="200" rx="44" fill="#070D18"/>
  <rect width="200" height="200" rx="44" fill="none" stroke="#00E5FF" stroke-width="2" stroke-opacity="0.2"/>
  ${ICON_BODY}
</svg>
`;

// 3. orbinex-icon-light.svg (On light tile)
const fileIconLight = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  ${ICON_DEFS}
  <rect width="200" height="200" rx="44" fill="#FFFFFF"/>
  <rect width="200" height="200" rx="44" fill="none" stroke="#E2E8F0" stroke-width="2"/>
  ${ICON_BODY}
</svg>
`;

// 4. orbinex-logo-horizontal.svg (Transparent, Width: 780, Height: 200)
const fileLogoHorizontal = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 200" width="100%" height="100%">
  ${ICON_DEFS}
  <!-- Icon Mark (Integrated as 'O') -->
  <g transform="translate(10, 0)">
    ${ICON_BODY}
  </g>
  <!-- Wordmark RBINEX -->
  ${WORDMARK_RBINEX(true)}
  <!-- Tagline -->
  ${TAGLINE(true)}
</svg>
`;

// 5. orbinex-logo-horizontal-dark.svg (On #070D18 Dark Slate Canvas)
const fileLogoHorizontalDark = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 220" width="100%" height="100%">
  ${ICON_DEFS}
  <rect width="800" height="220" rx="16" fill="#070D18"/>
  <rect width="800" height="220" rx="16" fill="none" stroke="#00E5FF" stroke-width="1" stroke-opacity="0.15"/>
  <g transform="translate(10, 10)">
    <g transform="translate(10, 0)">
      ${ICON_BODY}
    </g>
    ${WORDMARK_RBINEX(true)}
    ${TAGLINE(true)}
  </g>
</svg>
`;

// 6. orbinex-logo-horizontal-light.svg (On Pure White #FFFFFF Canvas)
const fileLogoHorizontalLight = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 220" width="100%" height="100%">
  ${ICON_DEFS}
  <rect width="800" height="220" rx="16" fill="#FFFFFF"/>
  <rect width="800" height="220" rx="16" fill="none" stroke="#E2E8F0" stroke-width="1.5"/>
  <g transform="translate(10, 10)">
    <g transform="translate(10, 0)">
      ${ICON_BODY}
    </g>
    ${WORDMARK_RBINEX(false)}
    ${TAGLINE(false)}
  </g>
</svg>
`;

// 7. orbinex-logo-stacked.svg (Centered Primary Stacked Lockup, 600x480)
const fileLogoStacked = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 480" width="100%" height="100%">
  ${ICON_DEFS}
  <!-- Centered Icon Mark -->
  <g transform="translate(200, 30)">
    ${ICON_BODY}
  </g>
  <!-- Full Centered Wordmark ORBINEX -->
  <g transform="translate(-75, 205)">
    ${WORDMARK_FULL(true)}
  </g>
  <!-- Tagline Centered -->
  <g transform="translate(75, 395)">
    <text font-family="'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="500" letter-spacing="0.18em" text-anchor="middle">
      <tspan fill="#E2E8F0">See the World. </tspan>
      <tspan fill="#00E5FF" font-weight="600">Understand the Change.</tspan>
    </text>
  </g>
</svg>
`;

// 8. orbinex-logo-monochrome-white.svg (Pure 100% White Vector)
const fileMonoWhite = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 200" width="100%" height="100%">
  <g transform="translate(10, 0)">
    ${ICON_MONO('#FFFFFF')}
  </g>
  ${WORDMARK_MONO('#FFFFFF')}
  ${TAGLINE_MONO('#FFFFFF')}
</svg>
`;

// 9. orbinex-logo-monochrome-black.svg (Pure 100% Black Vector)
const fileMonoBlack = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 200" width="100%" height="100%">
  <g transform="translate(10, 0)">
    ${ICON_MONO('#000000')}
  </g>
  ${WORDMARK_MONO('#000000')}
  ${TAGLINE_MONO('#000000')}
</svg>
`;

// 10. orbinex-favicon.svg (Optimized for 64x64 or 32x32)
const fileFavicon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs>
    <linearGradient id="fav-ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00E5FF"/>
      <stop offset="100%" stop-color="#0052CC"/>
    </linearGradient>
    <radialGradient id="fav-globe" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#0A2540"/>
      <stop offset="100%" stop-color="#020814"/>
    </radialGradient>
  </defs>

  <!-- Background tile for crisp contrast -->
  <rect width="64" height="64" rx="14" fill="#050B14"/>

  <!-- Outer 'O' Torus Ring -->
  <circle cx="32" cy="32" r="23" fill="none" stroke="url(#fav-ring)" stroke-width="5"/>

  <!-- Inner Globe Core -->
  <circle cx="32" cy="32" r="16" fill="url(#fav-globe)" stroke="#00E5FF" stroke-width="0.8" stroke-opacity="0.6"/>
  <!-- Meridian & Parallels -->
  <ellipse cx="32" cy="32" rx="7" ry="16" fill="none" stroke="#00E5FF" stroke-width="0.7" stroke-opacity="0.4"/>
  <line x1="16" y1="32" x2="48" y2="32" stroke="#00E5FF" stroke-width="0.7" stroke-opacity="0.4"/>

  <!-- Elliptical Satellite Orbit -->
  <ellipse cx="32" cy="32" rx="27" ry="9" fill="none" stroke="#00E5FF" stroke-width="1.8" transform="rotate(-28 32 32)"/>

  <!-- Satellite Beacon -->
  <g transform="rotate(-28 32 32)">
    <circle cx="58" cy="32" r="3" fill="#00E5FF"/>
    <circle cx="58" cy="32" r="1.2" fill="#FFFFFF"/>
  </g>

  <!-- Optical Center Sensor -->
  <circle cx="32" cy="32" r="1.5" fill="#FFFFFF"/>
</svg>
`;

// Write all assets to public/brand/
const assets = [
  { name: 'orbinex-icon.svg', content: fileIcon },
  { name: 'orbinex-icon-dark.svg', content: fileIconDark },
  { name: 'orbinex-icon-light.svg', content: fileIconLight },
  { name: 'orbinex-logo-horizontal.svg', content: fileLogoHorizontal },
  { name: 'orbinex-logo-horizontal-dark.svg', content: fileLogoHorizontalDark },
  { name: 'orbinex-logo-horizontal-light.svg', content: fileLogoHorizontalLight },
  { name: 'orbinex-logo-stacked.svg', content: fileLogoStacked },
  { name: 'orbinex-logo-monochrome-white.svg', content: fileMonoWhite },
  { name: 'orbinex-logo-monochrome-black.svg', content: fileMonoBlack },
  { name: 'orbinex-favicon.svg', content: fileFavicon }
];

assets.forEach(a => {
  fs.writeFileSync(path.join(brandDir, a.name), a.content.trim());
  console.log('✓ Created:', a.name);
});

// Also update root public/favicon.svg and public/favicon-32.svg
const publicDir = 'C:/Users/shash/Downloads/osiris-master/osiris-master/public';
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), fileFavicon.trim());
fs.writeFileSync(path.join(publicDir, 'favicon-32.svg'), fileFavicon.trim());
console.log('✓ Updated public/favicon.svg and public/favicon-32.svg');
