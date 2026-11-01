'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  SlidersHorizontal,
  Columns2,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Hand,
  MoveHorizontal,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Download,
  Eye,
  Crosshair,
} from 'lucide-react';
import type { SatelliteScene, SatellitePlatform } from '@/lib/satellite/types';
import type { RasterAlignmentResult } from '@/lib/satellite/alignment';
import {
  ComparisonMode,
  computeResolutionAsymmetry,
  clampViewportPan,
  getSensorSpec,
  DEFAULT_VIEWPORT_TRANSFORM,
  ViewportTransform,
} from '@/lib/satellite/comparison-specs';

interface ProfessionalComparisonViewerProps {
  beforeScene: SatelliteScene | null;
  afterScene: SatelliteScene | null;
  beforeImageUrl: string;
  afterImageUrl: string;
  aoiName?: string;
  aoiBbox?: [number, number, number, number] | null;
  platform?: SatellitePlatform | string;
  alignmentResult?: RasterAlignmentResult | null;
  onLocate?: (lat: number, lng: number, zoom?: number) => void;
  className?: string;
}

export default function ProfessionalComparisonViewer({
  beforeScene,
  afterScene,
  beforeImageUrl,
  afterImageUrl,
  aoiName = 'Area of Interest',
  aoiBbox,
  platform = 'Sentinel-2',
  alignmentResult,
  onLocate,
  className = '',
}: ProfessionalComparisonViewerProps) {
  // Mode State
  const [mode, setMode] = useState<ComparisonMode>('swipe');
  const [sliderPos, setSliderPos] = useState<number>(50); // 0 to 100%
  const [overlayOpacity, setOverlayOpacity] = useState<number>(50); // 0 to 100%
  const [isFlickering, setIsFlickering] = useState<boolean>(false);
  const [diffBlend, setDiffBlend] = useState<boolean>(false);
  const [showCrosshair, setShowCrosshair] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [interactionTool, setInteractionTool] = useState<'slider' | 'pan'>('slider');

  // Synchronized Geographic Viewport Transform
  const [transform, setTransform] = useState<ViewportTransform>(DEFAULT_VIEWPORT_TRANSFORM);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number }>({
    x: 0,
    y: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Container References
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const isDividerDraggingRef = useRef<boolean>(false);
  const flickerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-Resolution Analysis
  const resolutionAsymmetry = useMemo(() => {
    return computeResolutionAsymmetry(
      beforeScene?.platform || platform,
      afterScene?.platform || platform
    );
  }, [beforeScene?.platform, afterScene?.platform, platform]);

  const beforeSpec = useMemo(() => getSensorSpec(beforeScene?.platform || platform), [beforeScene?.platform, platform]);
  const afterSpec = useMemo(() => getSensorSpec(afterScene?.platform || platform), [afterScene?.platform, platform]);

  // Synchronized Zoom Handlers
  const handleZoom = useCallback((delta: number, focalPoint?: { clientX: number; clientY: number }) => {
    setTransform((prev) => {
      const newZoom = Math.min(8.0, Math.max(1.0, Math.round((prev.zoom + delta) * 10) / 10));
      if (newZoom === prev.zoom) return prev;

      if (!containerRef.current || !focalPoint) {
        return {
          ...prev,
          zoom: newZoom,
        };
      }

      const rect = containerRef.current.getBoundingClientRect();
      const relX = focalPoint.clientX - rect.left - rect.width / 2;
      const relY = focalPoint.clientY - rect.top - rect.height / 2;

      const scaleChange = newZoom / prev.zoom;
      const newPanX = prev.panX * scaleChange - relX * (scaleChange - 1);
      const newPanY = prev.panY * scaleChange - relY * (scaleChange - 1);

      const clamped = clampViewportPan(newPanX, newPanY, newZoom, rect.width, rect.height);
      return {
        zoom: newZoom,
        panX: clamped.panX,
        panY: clamped.panY,
      };
    });
  }, []);

  const handleResetView = useCallback(() => {
    setTransform(DEFAULT_VIEWPORT_TRANSFORM);
    setSliderPos(50);
  }, []);

  // Mouse Wheel Zooming
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    handleZoom(delta, { clientX: e.clientX, clientY: e.clientY });
  }, [handleZoom]);

  // Pan Gestures (Synchronized Across Both Viewports)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (interactionTool === 'pan' || mode === 'side-by-side' || (e.buttons === 1 && e.altKey)) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanX: transform.panX,
        startPanY: transform.panY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [interactionTool, mode, transform.panX, transform.panY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current && containerRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const rect = containerRef.current.getBoundingClientRect();
      const clamped = clampViewportPan(
        dragStartRef.current.startPanX + dx,
        dragStartRef.current.startPanY + dy,
        transform.zoom,
        rect.width,
        rect.height
      );
      setTransform((prev) => ({
        ...prev,
        panX: clamped.panX,
        panY: clamped.panY,
      }));
    }
  }, [transform.zoom]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, []);

  // Swipe Divider Dragging
  const handleDividerPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    isDividerDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDividerPointerMove = useCallback((e: React.PointerEvent) => {
    if (isDividerDraggingRef.current && swipeContainerRef.current) {
      const rect = swipeContainerRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const newPct = Math.max(0, Math.min(100, (relX / rect.width) * 100));
      setSliderPos(Math.round(newPct * 10) / 10);
    }
  }, []);

  const handleDividerPointerUp = useCallback((e: React.PointerEvent) => {
    if (isDividerDraggingRef.current) {
      isDividerDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, []);

  // Keyboard Accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 2;
      setSliderPos((p) => Math.max(0, p - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 2;
      setSliderPos((p) => Math.min(100, p + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSliderPos(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSliderPos(100);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      handleZoom(0.3);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      handleZoom(-0.3);
    } else if (e.key === '0') {
      e.preventDefault();
      handleResetView();
    } else if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false);
    }
  }, [handleZoom, handleResetView, isFullscreen]);

  // Flicker / Blink Animation Loop (Overlay Mode)
  useEffect(() => {
    if (isFlickering) {
      flickerTimerRef.current = setInterval(() => {
        setOverlayOpacity((op) => (op > 50 ? 0 : 100));
      }, 500);
    } else {
      if (flickerTimerRef.current) clearInterval(flickerTimerRef.current);
    }
    return () => {
      if (flickerTimerRef.current) clearInterval(flickerTimerRef.current);
    };
  }, [isFlickering]);

  // Transform Style for Synchronized Imagery
  const transformStyle = useMemo(() => {
    return {
      transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0px) scale(${transform.zoom})`,
      transformOrigin: 'center center',
      willChange: 'transform',
      transition: isDraggingRef.current ? 'none' : 'transform 100ms ease-out',
    };
  }, [transform.panX, transform.panY, transform.zoom]);

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`rounded-xl border border-cyan-500/40 bg-[#060B11] text-slate-100 flex flex-col overflow-hidden shadow-[0_0_25px_rgba(0,229,255,0.08)] outline-none focus:border-cyan-400 ${
        isFullscreen
          ? 'fixed inset-4 z-50 shadow-[0_0_60px_rgba(0,229,255,0.3)] bg-black/95 backdrop-blur-md'
          : className
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="px-3 py-2 bg-black/80 border-b border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
        {/* Mode Selector Buttons */}
        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => setMode('swipe')}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              mode === 'swipe'
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50 shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Swipe (↔)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('side-by-side')}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              mode === 'side-by-side'
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50 shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            <span>Side-by-Side (⧉)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('overlay')}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              mode === 'overlay'
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50 shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Overlay (◫)</span>
          </button>
        </div>

        {/* Viewport & Synchronized Zoom Navigation Controls */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <div className="flex items-center bg-black/60 rounded border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => handleZoom(-0.25)}
              disabled={transform.zoom <= 1.0}
              className="p-1 text-slate-400 hover:text-cyan-400 disabled:opacity-40"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[9px] text-[#00E5FF] font-bold min-w-[34px] text-center">
              {transform.zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={() => handleZoom(0.25)}
              disabled={transform.zoom >= 8.0}
              className="p-1 text-slate-400 hover:text-cyan-400 disabled:opacity-40"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="p-1 text-slate-400 hover:text-cyan-400 ml-1 border-l border-white/10"
              title="Reset Zoom & Pan (0)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pan / Slider Tool Switcher */}
          <button
            type="button"
            onClick={() => setInteractionTool((t) => (t === 'pan' ? 'slider' : 'pan'))}
            className={`p-1.5 rounded border ${
              interactionTool === 'pan'
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/50 shadow-[0_0_8px_rgba(0,229,255,0.2)]'
                : 'bg-black/60 text-slate-400 border-white/10 hover:text-white'
            }`}
            title={interactionTool === 'pan' ? 'Pan Tool Active (Drag to Pan)' : 'Divider Tool Active'}
          >
            {interactionTool === 'pan' ? <Hand className="w-3.5 h-3.5" /> : <MoveHorizontal className="w-3.5 h-3.5" />}
          </button>

          {/* Crosshair Overlay */}
          <button
            type="button"
            onClick={() => setShowCrosshair((c) => !c)}
            className={`p-1.5 rounded border ${
              showCrosshair
                ? 'bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/50'
                : 'bg-black/60 text-slate-400 border-white/10 hover:text-white'
            }`}
            title="Toggle Precision Center Crosshair"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Expansion */}
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 rounded bg-black/60 text-slate-400 border border-white/10 hover:text-cyan-400 hover:border-cyan-400/40"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Maximize Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Multi-Resolution GSD & Alignment Diagnostics Strip */}
      <div className="px-3 py-1.5 bg-black/50 border-b border-white/10 flex flex-wrap items-center justify-between text-[9px] gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-slate-400 uppercase font-semibold">BEFORE:</span>
            <span className="text-white font-mono font-bold">
              {beforeScene?.datetime ? beforeScene.datetime.slice(0, 10) : 'Baseline'}
            </span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-950/70 text-cyan-300 font-mono text-[8px] border border-cyan-500/30">
              {beforeSpec.nativeGsdMeters}m GSD • {beforeSpec.platform}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00E5FF]" />
            <span className="text-slate-400 uppercase font-semibold">AFTER:</span>
            <span className="text-white font-mono font-bold">
              {afterScene?.datetime ? afterScene.datetime.slice(0, 10) : 'Pass'}
            </span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-950/70 text-[#00E5FF] font-mono text-[8px] border border-cyan-500/30">
              {afterSpec.nativeGsdMeters}m GSD • {afterSpec.platform}
            </span>
          </div>
        </div>

        {/* Alignment Quality Badge */}
        {alignmentResult && (
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border flex items-center gap-1 ${
              alignmentResult.quality_status === 'GOOD'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                : alignmentResult.quality_status === 'ACCEPTABLE'
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
                  : 'bg-amber-950/80 text-amber-300 border-amber-500/50'
            }`}>
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>CO-REGISTERED ({alignmentResult.metrics.rmse_pixels.toFixed(2)}px RMSE)</span>
            </span>
          </div>
        )}
      </div>

      {/* Multi-Resolution Asymmetry Warning (if exists) */}
      {resolutionAsymmetry.hasAsymmetry && (
        <div className="px-3 py-1 bg-amber-950/30 border-b border-amber-500/30 text-amber-200 text-[8px] flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{resolutionAsymmetry.message}</span>
        </div>
      )}

      {/* 3. Main Synchronized Viewport Area */}
      <div
        className="relative flex-1 min-h-[340px] md:min-h-[420px] bg-[#030609] overflow-hidden select-none cursor-crosshair"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Nodata Dark Geointel Checkerboard Background Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle, #00E5FF 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* MODE A: Interactive Swipe Mode */}
        {mode === 'swipe' && (
          <div
            ref={swipeContainerRef}
            className="absolute inset-0 w-full h-full overflow-hidden"
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
          >
            {/* AFTER Layer (Base Viewport) */}
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              {afterImageUrl ? (
                <img
                  src={afterImageUrl}
                  alt="Contemporary Satellite Observation"
                  style={transformStyle}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-black/90 text-slate-400">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mb-2" />
                  <span className="text-xs font-semibold text-slate-200">No suitable satellite observation found for AFTER date and AOI.</span>
                  <span className="text-[10px] text-slate-500 mt-1">Select an alternative date or expand cloud tolerance.</span>
                </div>
              )}
            </div>

            {/* BEFORE Layer (Clipped Overlay via synchronized clip-path) */}
            <div
              className="absolute inset-0 w-full h-full overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              {beforeImageUrl ? (
                <img
                  src={beforeImageUrl}
                  alt="Historical Satellite Observation"
                  style={transformStyle}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-black/90 text-slate-400">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mb-2" />
                  <span className="text-xs font-semibold text-slate-200">No suitable satellite observation found for BEFORE date and AOI.</span>
                  <span className="text-[10px] text-slate-500 mt-1">Select an alternative date or expand cloud tolerance.</span>
                </div>
              )}
            </div>

            {/* Draggable Vertical Divider Line */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none border-r-2 border-[#00E5FF] shadow-[0_0_12px_#00E5FF]"
              style={{ left: `${sliderPos}%` }}
            >
              {/* Central Divider Handle Knob */}
              <div
                onPointerDown={handleDividerPointerDown}
                className="pointer-events-auto absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#00E5FF] text-black flex items-center justify-center text-[10px] font-bold shadow-[0_0_15px_#00E5FF] cursor-ew-resize hover:scale-110 active:scale-95 transition-transform"
                title="Drag to Compare (or use Left/Right arrow keys)"
              >
                ⇄
              </div>
            </div>

            {/* Floating Telemetry Badges */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/80 border border-cyan-500/40 text-cyan-300 font-mono text-[9px] font-bold pointer-events-none backdrop-blur-sm shadow-md">
              BEFORE: {beforeScene?.datetime ? beforeScene.datetime.slice(0, 10) : 'Baseline'}
            </div>
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/80 border border-[#00E5FF]/40 text-[#00E5FF] font-mono text-[9px] font-bold pointer-events-none backdrop-blur-sm shadow-md">
              AFTER: {afterScene?.datetime ? afterScene.datetime.slice(0, 10) : 'Pass'}
            </div>

            {/* Real-time Slider Position Readout */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/80 border border-white/20 text-[#00E5FF] font-mono text-[9px] font-bold pointer-events-none">
              {sliderPos.toFixed(1)}% REVEAL
            </div>
          </div>
        )}

        {/* MODE B: Side-by-Side Synchronized Mode */}
        {mode === 'side-by-side' && (
          <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 gap-1 p-1 bg-black/90">
            {/* Viewport 1: BEFORE */}
            <div className="relative w-full h-full overflow-hidden rounded border border-cyan-500/30 bg-[#060B11]">
              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/85 text-cyan-300 font-mono text-[8.5px] font-bold border border-cyan-500/40">
                HISTORICAL: {beforeScene?.datetime ? beforeScene.datetime.slice(0, 10) : 'Before'} ({beforeSpec.nativeGsdMeters}m)
              </div>
              {beforeImageUrl ? (
                <img
                  src={beforeImageUrl}
                  alt="Before Scene"
                  style={transformStyle}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-slate-400">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mb-1" />
                  <span className="text-[10px] text-slate-300">No suitable observation found</span>
                </div>
              )}
            </div>

            {/* Viewport 2: AFTER (Locked in 1:1 Synchronized Transform) */}
            <div className="relative w-full h-full overflow-hidden rounded border border-[#00E5FF]/30 bg-[#060B11]">
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded bg-black/85 text-[#00E5FF] font-mono text-[8.5px] font-bold border border-[#00E5FF]/40">
                CONTEMPORARY: {afterScene?.datetime ? afterScene.datetime.slice(0, 10) : 'After'} ({afterSpec.nativeGsdMeters}m)
              </div>
              {afterImageUrl ? (
                <img
                  src={afterImageUrl}
                  alt="After Scene"
                  style={transformStyle}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-slate-400">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mb-1" />
                  <span className="text-[10px] text-slate-300">No suitable observation found</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE C: Split / Overlay (Fader & Difference) Mode */}
        {mode === 'overlay' && (
          <div className="absolute inset-0 w-full h-full overflow-hidden">
            {/* Base Layer: BEFORE */}
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              {beforeImageUrl ? (
                <img
                  src={beforeImageUrl}
                  alt="Historical Baseline"
                  style={transformStyle}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                  No Before Observation
                </div>
              )}
            </div>

            {/* Overlay Layer: AFTER with Dynamic Opacity & Difference Blend */}
            <div
              className="absolute inset-0 w-full h-full overflow-hidden"
              style={{
                opacity: overlayOpacity / 100,
                mixBlendMode: diffBlend ? 'difference' : 'normal',
              }}
            >
              {afterImageUrl ? (
                <img
                  src={afterImageUrl}
                  alt="Contemporary Layer"
                  style={transformStyle}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                  No After Observation
                </div>
              )}
            </div>

            {/* Overlay Controls Bar */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-black/90 border border-cyan-500/40 flex items-center gap-3 backdrop-blur-md shadow-xl text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-mono">OPACITY:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={overlayOpacity}
                  onChange={(e) => {
                    setIsFlickering(false);
                    setOverlayOpacity(parseInt(e.target.value, 10));
                  }}
                  className="w-24 accent-[#00E5FF] cursor-pointer"
                />
                <span className="font-mono text-[#00E5FF] font-bold min-w-[28px]">{overlayOpacity}%</span>
              </div>

              {/* Flicker / Blink Button */}
              <button
                type="button"
                onClick={() => setIsFlickering((f) => !f)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border transition-all ${
                  isFlickering
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                    : 'bg-white/10 text-slate-300 border-white/20 hover:text-white'
                }`}
                title="Blink rapidly between dates to spot new buildings, road expansion, or tree clearing"
              >
                {isFlickering ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                <span>{isFlickering ? 'Stop Flicker' : 'Flicker Blink'}</span>
              </button>

              {/* Difference Blend Mode */}
              <button
                type="button"
                onClick={() => setDiffBlend((d) => !d)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-all ${
                  diffBlend
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                    : 'bg-white/10 text-slate-300 border-white/20 hover:text-white'
                }`}
                title="Spectral Difference: Identical pixels cancel out, changed pixels illuminate"
              >
                <span>Δ Difference</span>
              </button>
            </div>
          </div>
        )}

        {/* Center Precision Crosshair (when enabled) */}
        {showCrosshair && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-8 h-8 border border-[#00E5FF]/60 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-[#00E5FF] rounded-full shadow-[0_0_8px_#00E5FF]" />
            </div>
            <div className="absolute w-12 h-px bg-[#00E5FF]/40" />
            <div className="absolute h-12 w-px bg-[#00E5FF]/40" />
          </div>
        )}
      </div>

      {/* 4. Footer Telemetry & Navigation Bar */}
      <div className="px-3 py-1.5 bg-black/80 border-t border-cyan-500/30 flex flex-wrap items-center justify-between text-[8px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>AOI: <b className="text-white">{aoiName}</b></span>
          {aoiBbox && (
            <span className="font-mono text-[7.5px] text-cyan-400">
              [{aoiBbox.map((v) => v.toFixed(3)).join(', ')}]
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span>Pan: <b>{interactionTool === 'pan' ? 'Enabled (Drag)' : 'Hold Alt or Switch Tool'}</b></span>
          <span>Zoom: <b>Scroll wheel</b></span>
          <span>Divider: <b>Drag handle or Left/Right</b></span>
        </div>
      </div>
    </div>
  );
}
