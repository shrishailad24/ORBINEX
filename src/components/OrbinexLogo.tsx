'use client';

interface OrbinexLogoProps {
  className?: string;
  size?: number;
}

export default function OrbinexLogo({ className = 'w-9 h-9', size }: OrbinexLogoProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <img
      src="/brand/orbinex-icon-exact-transparent.png"
      alt="ORBINEX Logo"
      className={`shrink-0 object-contain drop-shadow-[0_0_14px_rgba(0,229,255,0.55)] ${className}`}
      style={style}
    />
  );
}
