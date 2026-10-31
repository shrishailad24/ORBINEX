'use client';

import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
  color: string;
  isSparkle: boolean;
  spikeSize: number;
}

interface SpaceBackgroundProps {
  projection?: 'globe' | 'mercator';
  className?: string;
}

export default function SpaceBackground({
  projection = 'globe',
  className = '',
}: SpaceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initStars();
    };

    window.addEventListener('resize', handleResize);

    const STAR_COUNT = Math.min(350, Math.floor((width * height) / 4500));
    const starColors = [
      '#FFFFFF',
      '#E0F2FE', // light cyan-white
      '#BAE6FD', // soft sky blue
      '#7DD3FC', // electric light blue
      '#38BDF8', // vibrant space blue
      '#67E8F9', // bright cyan
      '#FDE047', // subtle warm white/gold
    ];

    let stars: Star[] = [];

    const initStars = () => {
      stars = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        const isSparkle = Math.random() < 0.12; // 12% are sparkling cross stars
        const radius = isSparkle
          ? Math.random() * 1.2 + 1.2
          : Math.random() * 1.1 + 0.4;
        const color = starColors[Math.floor(Math.random() * starColors.length)];

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius,
          baseAlpha: Math.random() * 0.5 + 0.35,
          alpha: Math.random() * 0.7 + 0.3,
          twinkleSpeed: Math.random() * 0.025 + 0.008,
          phase: Math.random() * Math.PI * 2,
          color,
          isSparkle,
          spikeSize: isSparkle ? Math.random() * 5 + 3 : 0,
        });
      }
    };

    initStars();

    let time = 0;
    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // ── 1. True Obsidian Deep Space Gradient ──
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        width * 0.05,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      );
      bgGrad.addColorStop(0, '#020713'); // Extremely dark midnight blue undertone at center
      bgGrad.addColorStop(0.3, '#01040B'); // Deep space near-black
      bgGrad.addColorStop(0.65, '#000206'); // Pitch black vacuum
      bgGrad.addColorStop(1, '#000002'); // True obsidian space

      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // ── 2. Glowing Nebula Dust Clouds (Faint & Mysterious) ──
      // Top-left cyan nebula
      const nebula1 = ctx.createRadialGradient(
        width * 0.25,
        height * 0.3,
        10,
        width * 0.25,
        height * 0.3,
        width * 0.4
      );
      nebula1.addColorStop(0, 'rgba(0, 200, 255, 0.035)');
      nebula1.addColorStop(0.5, 'rgba(2, 35, 80, 0.015)');
      nebula1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebula1;
      ctx.fillRect(0, 0, width, height);

      // Bottom-right sapphire nebula
      const nebula2 = ctx.createRadialGradient(
        width * 0.75,
        height * 0.7,
        20,
        width * 0.75,
        height * 0.7,
        width * 0.45
      );
      nebula2.addColorStop(0, 'rgba(20, 50, 150, 0.04)');
      nebula2.addColorStop(0.6, 'rgba(5, 20, 60, 0.01)');
      nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebula2;
      ctx.fillRect(0, 0, width, height);

      // Central planetary aura (subtle atmospheric halo behind the globe)
      const aura = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        120,
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.52
      );
      aura.addColorStop(0, 'rgba(0, 100, 240, 0.025)');
      aura.addColorStop(0.8, 'rgba(0, 40, 120, 0.008)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);

      // ── 3. Render Sparkling & Twinkling Stars ──
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.phase += s.twinkleSpeed;
        const currentAlpha = Math.max(
          0.15,
          Math.min(1.0, s.baseAlpha + Math.sin(s.phase) * 0.38)
        );

        ctx.save();
        ctx.globalAlpha = currentAlpha;
        ctx.fillStyle = s.color;

        // Draw star core
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw sparkle diffraction spikes for bright diamond stars
        if (s.isSparkle && currentAlpha > 0.45) {
          const spike = s.spikeSize * (0.7 + Math.sin(s.phase * 1.5) * 0.3);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          // Horizontal spike
          ctx.moveTo(s.x - spike, s.y);
          ctx.lineTo(s.x + spike, s.y);
          // Vertical spike
          ctx.moveTo(s.x, s.y - spike);
          ctx.lineTo(s.x, s.y + spike);
          ctx.stroke();

          // Subtle soft halo
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
          ctx.fill();
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      className={`absolute inset-0 w-full h-full pointer-events-none overflow-hidden select-none transition-opacity duration-1000 ${
        projection === 'globe' ? 'opacity-100' : 'opacity-30'
      } ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
}
