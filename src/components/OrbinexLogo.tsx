'use client';

interface OrbinexLogoProps {
  className?: string;
  size?: number;
}

export default function OrbinexLogo({ className = 'w-9 h-9', size }: OrbinexLogoProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="0 0 100 100"
      className={`shrink-0 drop-shadow-[0_0_12px_rgba(0,229,255,0.45)] ${className}`}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ORBINEX Logo"
    >
      <defs>
        <linearGradient id="orbinex-core" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="50%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id="orbinex-orbit" x1="10" y1="20" x2="90" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#38BDF8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.8" />
        </linearGradient>
        <filter id="orbinex-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer Hexagonal Targeting Reticle */}
      <polygon
        points="50,6 88,28 88,72 50,94 12,72 12,28"
        stroke="#00E5FF"
        strokeWidth="1.5"
        strokeOpacity="0.35"
        strokeDasharray="4 3"
      />

      {/* Coordinate Crosshairs */}
      <line x1="50" y1="2" x2="50" y2="12" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="88" x2="50" y2="98" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="50" x2="12" y2="50" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
      <line x1="88" y1="50" x2="98" y2="50" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />

      {/* Primary Orbital Ellipse (Tilted Satellite Trajectory) */}
      <ellipse
        cx="50"
        cy="50"
        rx="36"
        ry="15"
        transform="rotate(-28 50 50)"
        stroke="url(#orbinex-orbit)"
        strokeWidth="2.2"
        strokeDasharray="80 12"
      />

      {/* Secondary Counter-Orbit */}
      <ellipse
        cx="50"
        cy="50"
        rx="34"
        ry="13"
        transform="rotate(38 50 50)"
        stroke="#00E5FF"
        strokeWidth="1.2"
        strokeOpacity="0.4"
      />

      {/* Active Satellite Node on Orbit */}
      <g transform="rotate(-28 50 50)">
        <circle cx="86" cy="50" r="3.5" fill="#00E5FF" filter="url(#orbinex-glow)" />
        <circle cx="86" cy="50" r="1.5" fill="#FFFFFF" />
        {/* Satellite solar array tabs */}
        <line x1="86" y1="44" x2="86" y2="56" stroke="#D4AF37" strokeWidth="1" />
      </g>

      {/* Central Geospatial Globe / Planet Core */}
      <circle cx="50" cy="50" r="18" fill="#050B14" stroke="url(#orbinex-core)" strokeWidth="2" />

      {/* Latitude / Longitude Curvature Lines */}
      <ellipse cx="50" cy="50" rx="9" ry="18" stroke="#00E5FF" strokeWidth="0.8" strokeOpacity="0.45" />
      <line x1="32" y1="50" x2="68" y2="50" stroke="#00E5FF" strokeWidth="0.8" strokeOpacity="0.45" />
      <ellipse cx="50" cy="42" rx="15" ry="4" stroke="#00E5FF" strokeWidth="0.6" strokeOpacity="0.3" />
      <ellipse cx="50" cy="58" rx="15" ry="4" stroke="#00E5FF" strokeWidth="0.6" strokeOpacity="0.3" />

      {/* Sensor Nucleus */}
      <circle cx="50" cy="50" r="4.5" fill="#00E5FF" filter="url(#orbinex-glow)" />
      <circle cx="50" cy="50" r="2" fill="#FFFFFF" />
    </svg>
  );
}
