'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Calendar,
  Eye,
  Sliders,
  MapPin,
  ExternalLink,
  RefreshCw,
  X,
  Satellite,
  Compass,
  Cloud,
  ChevronRight,
  Maximize2,
  Download,
  Sparkles,
  Info
} from 'lucide-react';
import { STRATEGIC_PRESETS, type StrategicLocationPreset } from '@/lib/satellite/historical-providers';
import { type HistoricalComparisonPair, type SatelliteScene } from '@/lib/satellite/types';

interface SatelliteComparePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLocate?: (lat: number, lng: number, zoom?: number) => void;
  onProjectImagery?: (config: {
    beforeScene: SatelliteScene | null;
    afterScene: SatelliteScene | null;
    tileUrl?: string;
    opacity: number;
    processedImageUrl?: string;
  }) => void;
}

export default function SatelliteComparePanel({
  isOpen,
  onClose,
  onLocate,
  onProjectImagery,
}: SatelliteComparePanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<StrategicLocationPreset>(STRATEGIC_PRESETS[0]);
  const [platform, setPlatform] = useState<'Sentinel-2' | 'Sentinel-1' | 'NASA-GIBS'>('Sentinel-2');
  const [beforeDate, setBeforeDate] = useState(selectedPreset.suggestedBeforeDate);
  const [afterDate, setAfterDate] = useState(selectedPreset.suggestedAfterDate);
  const [maxCloudCover, setMaxCloudCover] = useState(20);
  const [opacity, setOpacity] = useState(85);
  const [contrastStretch, setContrastStretch] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<HistoricalComparisonPair | null>(null);
  const [projectedSceneId, setProjectedSceneId] = useState<string | null>(null);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProcessedImageUrl(null);
    try {
      const params = new URLSearchParams({
        lat: selectedPreset.lat.toString(),
        lng: selectedPreset.lng.toString(),
        before: beforeDate,
        after: afterDate,
        platform,
      });

      const res = await fetch(`/api/satellite/compare?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.comparison) {
        setComparison(data.comparison);
        const activeScene = data.comparison.after.matchedScene || data.comparison.before.matchedScene;
        if (activeScene) {
          setProjectedSceneId(activeScene.id);
        }
        onProjectImagery?.({
          beforeScene: data.comparison.before.matchedScene,
          afterScene: data.comparison.after.matchedScene,
          tileUrl: data.comparison.after.tileUrl,
          opacity: opacity / 100,
        });
      }
    } catch (err: any) {
      console.warn('[ORBINEX] Satellite comparison fetch failed:', err);
      setError('Could not retrieve satellite imagery for this date range. Try relaxing cloud filter or selecting NASA GIBS.');
    } finally {
      setLoading(false);
    }
  }, [selectedPreset, beforeDate, afterDate, platform, opacity, onProjectImagery]);

  // Initial fetch on preset selection
  useEffect(() => {
    if (isOpen) {
      fetchComparison();
    }
  }, [isOpen, selectedPreset, platform]);

  const handleSelectPreset = (preset: StrategicLocationPreset) => {
    setSelectedPreset(preset);
    setBeforeDate(preset.suggestedBeforeDate);
    setAfterDate(preset.suggestedAfterDate);
    onLocate?.(preset.lat, preset.lng, preset.defaultZoom);
  };

  const handleProjectScene = async (scene: SatelliteScene, processFirst: boolean = false) => {
    if (!scene.thumbnailUrl) return;
    setProjectedSceneId(scene.id);

    if (processFirst) {
      setProcessing(true);
      try {
        const params = new URLSearchParams({
          url: scene.thumbnailUrl,
          stretch: contrastStretch ? 'true' : 'false',
          platform: scene.platform,
          width: '1024',
        });
        if (scene.bbox) {
          params.set('sceneBbox', scene.bbox.join(','));
          // Center AOI
          params.set('aoiBbox', [
            selectedPreset.lng - 0.15,
            selectedPreset.lat - 0.15,
            selectedPreset.lng + 0.15,
            selectedPreset.lat + 0.15,
          ].join(','));
        }

        const processUrl = `/api/satellite/process?${params.toString()}`;
        setProcessedImageUrl(processUrl);

        // Project onto map
        onProjectImagery?.({
          beforeScene: null,
          afterScene: scene,
          opacity: opacity / 100,
          processedImageUrl: processUrl,
        });
      } catch (e) {
        console.error('[ORBINEX] Processing failed:', e);
      } finally {
        setProcessing(false);
      }
    } else {
      onProjectImagery?.({
        beforeScene: null,
        afterScene: scene,
        opacity: opacity / 100,
      });
    }
  };

  const formatAcquisitionDate = (isoStr?: string) => {
    return isoStr ? isoStr.split('T')[0] : '';
  };

  const getDeltaDays = (actualStr?: string, targetStr?: string) => {
    if (!actualStr || !targetStr) return null;
    const t1 = new Date(actualStr.split('T')[0]).getTime();
    const t2 = new Date(targetStr.split('T')[0]).getTime();
    if (isNaN(t1) || isNaN(t2)) return null;
    const diff = Math.round((t1 - t2) / 86400000);
    return diff === 0 ? 'Exact Target' : (diff > 0 ? `+${diff}d nearest` : `${diff}d nearest`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 340 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 340 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-16 right-4 w-[380px] max-h-[calc(100vh-80px)] bg-[#070D18]/95 backdrop-blur-xl border border-[#00E5FF]/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(0,229,255,0.15)] z-[250] flex flex-col overflow-hidden font-mono"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Satellite className="w-4 h-4 text-[#00E5FF] animate-pulse" />
            <div>
              <h2 className="text-xs font-bold text-white tracking-wider uppercase">SATELLITE INTELLIGENCE ENGINE</h2>
              <p className="text-[9px] text-[#00E5FF]/80 tracking-widest uppercase">Sentinel-1/2 & Historical Comparison</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Container */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs scrollbar-thin scrollbar-thumb-white/10">
          {/* Preset Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3 h-3 text-[#00E5FF]" />
                <span>Strategic Indian Monitoring AOIs</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {STRATEGIC_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`p-2 rounded text-left border transition-all ${
                    selectedPreset.id === preset.id
                      ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-white shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[10.5px] font-bold truncate">{preset.name}</div>
                  <div className="text-[8.5px] text-[#00E5FF]/80 truncate mt-0.5">{preset.focus}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Platform Selector */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Constellation / Sensor</span>
              <span className="text-[#00E5FF]">{platform}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Sentinel-2', 'Sentinel-1', 'NASA-GIBS'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`py-1.5 px-2 rounded text-center border text-[9.5px] uppercase font-bold tracking-wider transition-all ${
                    platform === p
                      ? 'border-[#00E5FF] bg-[#00E5FF]/20 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-white'
                  }`}
                >
                  {p === 'Sentinel-2' ? 'S2 Optical' : p === 'Sentinel-1' ? 'S1 SAR' : 'NASA GIBS'}
                </button>
              ))}
            </div>
          </div>

          {/* Date Comparison Pickers */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-black/40 border border-white/10 space-y-1">
              <label className="text-[9px] text-cyan-400 uppercase tracking-wider font-bold block">
                Target Date (Historical)
              </label>
              <input
                type="date"
                value={beforeDate}
                onChange={(e) => setBeforeDate(e.target.value)}
                className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:border-[#00E5FF]"
              />
            </div>
            <div className="p-2 rounded bg-black/40 border border-white/10 space-y-1">
              <label className="text-[9px] text-[#00E5FF] uppercase tracking-wider font-bold block">
                Target Date (Current)
              </label>
              <input
                type="date"
                value={afterDate}
                onChange={(e) => setAfterDate(e.target.value)}
                className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:border-[#00E5FF]"
              />
            </div>
          </div>

          {/* Processing Controls */}
          <div className="p-2.5 rounded bg-black/40 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] text-slate-300 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#00E5FF]" />
                <span>Percentile Contrast Stretch (2%-98%)</span>
              </span>
              <input
                type="checkbox"
                checked={contrastStretch}
                onChange={(e) => setContrastStretch(e.target.checked)}
                className="accent-[#00E5FF] cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-slate-400 uppercase">
                <span>Map Overlay Opacity</span>
                <span className="text-[#00E5FF] font-bold">{opacity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={opacity}
                onChange={(e) => setOpacity(parseInt(e.target.value))}
                className="w-full accent-[#00E5FF] h-1.5 bg-white/10 rounded appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={fetchComparison}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 border border-[#00E5FF]/40 rounded-lg text-white font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.15)] disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00E5FF]" />
                <span>QUERYING STAC CATALOG...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>SEARCH SATELLITE IMAGERY</span>
              </>
            )}
          </button>

          {/* Error Message */}
          {error && (
            <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10.5px]">
              {error}
            </div>
          )}

          {/* Comparison Preview Cards */}
          {comparison && (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Captured Satellite Observations
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Before Card */}
                <div className={`bg-black/50 rounded-lg p-2 space-y-2 border transition-all ${
                  projectedSceneId === comparison.before.matchedScene?.id
                    ? 'border-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.25)]'
                    : 'border-cyan-500/30'
                }`}>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[8.5px] font-bold text-cyan-400 uppercase">
                          BEFORE {comparison.before.matchedScene?.datetime ? formatAcquisitionDate(comparison.before.matchedScene.datetime) : beforeDate}
                        </span>
                      </div>
                      {comparison.before.matchedScene?.cloudCover != null && (
                        <span className="text-[8px] text-slate-400">
                          ☁ {comparison.before.matchedScene.cloudCover}%
                        </span>
                      )}
                    </div>
                    {comparison.before.matchedScene?.datetime && (
                      <div className="flex items-center justify-between text-[7.5px] text-slate-400">
                        <span>Target: {beforeDate}</span>
                        <span className="text-cyan-400/90 font-mono">
                          {getDeltaDays(comparison.before.matchedScene.datetime, beforeDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="aspect-video bg-black/60 rounded border border-white/10 overflow-hidden relative">
                    {comparison.before.matchedScene?.thumbnailUrl ? (
                      <img
                        src={`/api/satellite/asset?url=${encodeURIComponent(comparison.before.matchedScene.thumbnailUrl)}`}
                        alt="Before Satellite Scene"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-full h-full flex flex-col items-center justify-center p-2 text-center text-[8.5px] text-amber-300/80 bg-black/80';
                            fallback.innerText = 'JPEG-2000 transcode pending. Click "Process AOI".';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-500 p-2 text-center">
                        No observation within 45d of target date
                      </div>
                    )}
                    {projectedSceneId === comparison.before.matchedScene?.id && (
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-[#00E5FF]/20 border border-[#00E5FF] text-[7.5px] text-[#00E5FF] font-bold tracking-wider backdrop-blur-sm shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                        ● ON MAP
                      </div>
                    )}
                  </div>

                  {comparison.before.matchedScene && (
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => handleProjectScene(comparison.before.matchedScene!, false)}
                        className={`py-1 text-[8px] font-bold uppercase rounded border transition-all ${
                          projectedSceneId === comparison.before.matchedScene.id
                            ? 'bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF]'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        Project Map
                      </button>
                      <button
                        onClick={() => handleProjectScene(comparison.before.matchedScene!, true)}
                        disabled={processing}
                        className="py-1 text-[8px] font-bold uppercase rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                        <span>Process</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* After Card */}
                <div className={`bg-black/50 rounded-lg p-2 space-y-2 border transition-all ${
                  projectedSceneId === comparison.after.matchedScene?.id
                    ? 'border-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.25)]'
                    : 'border-[#00E5FF]/40'
                }`}>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[8.5px] font-bold text-[#00E5FF] uppercase">
                          AFTER {comparison.after.matchedScene?.datetime ? formatAcquisitionDate(comparison.after.matchedScene.datetime) : afterDate}
                        </span>
                      </div>
                      {comparison.after.matchedScene?.cloudCover != null && (
                        <span className="text-[8px] text-slate-400">
                          ☁ {comparison.after.matchedScene.cloudCover}%
                        </span>
                      )}
                    </div>
                    {comparison.after.matchedScene?.datetime && (
                      <div className="flex items-center justify-between text-[7.5px] text-slate-400">
                        <span>Target: {afterDate}</span>
                        <span className="text-[#00E5FF]/90 font-mono">
                          {getDeltaDays(comparison.after.matchedScene.datetime, afterDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="aspect-video bg-black/60 rounded border border-white/10 overflow-hidden relative">
                    {comparison.after.matchedScene?.thumbnailUrl ? (
                      <img
                        src={`/api/satellite/asset?url=${encodeURIComponent(comparison.after.matchedScene.thumbnailUrl)}`}
                        alt="After Satellite Scene"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-full h-full flex flex-col items-center justify-center p-2 text-center text-[8.5px] text-amber-300/80 bg-black/80';
                            fallback.innerText = 'Transcode pending. Click "Process".';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-500 p-2 text-center">
                        No observation within 45d of target date
                      </div>
                    )}
                    {projectedSceneId === comparison.after.matchedScene?.id && (
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-[#00E5FF]/20 border border-[#00E5FF] text-[7.5px] text-[#00E5FF] font-bold tracking-wider backdrop-blur-sm shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                        ● ON MAP
                      </div>
                    )}
                  </div>

                  {comparison.after.matchedScene && (
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => handleProjectScene(comparison.after.matchedScene!, false)}
                        className={`py-1 text-[8px] font-bold uppercase rounded border transition-all ${
                          projectedSceneId === comparison.after.matchedScene.id
                            ? 'bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF]'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        Project Map
                      </button>
                      <button
                        onClick={() => handleProjectScene(comparison.after.matchedScene!, true)}
                        disabled={processing}
                        className="py-1 text-[8px] font-bold uppercase rounded bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/30 text-[#00E5FF] flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-[#00E5FF]" />
                        <span>Process</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Acquisition Metadata Card */}
              {(() => {
                const activeTelemetry = (projectedSceneId === comparison.before.matchedScene?.id ? comparison.before.matchedScene : comparison.after.matchedScene) || comparison.after.matchedScene || comparison.before.matchedScene;
                if (!activeTelemetry) return null;
                return (
                  <div className="p-2.5 rounded bg-black/60 border border-white/10 space-y-1.5 text-[9.5px]">
                    <div className="flex items-center justify-between text-slate-400 border-b border-white/5 pb-1">
                      <span className="flex items-center gap-1 text-[#00E5FF] font-bold">
                        <Info className="w-3 h-3" />
                        <span>Scene Telemetry ({projectedSceneId === comparison.before.matchedScene?.id ? 'BEFORE' : 'AFTER'})</span>
                      </span>
                      <span className="text-[8px] text-slate-400">EPSG:4326 (WGS84)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[8.5px] pt-0.5">
                      <div>
                        <span className="text-slate-500">Platform: </span>
                        <span className="text-white font-semibold">{activeTelemetry.platform}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Acquisition: </span>
                        <span className="text-[#00E5FF] font-semibold">{formatAcquisitionDate(activeTelemetry.datetime)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Resolution: </span>
                        <span className="text-white font-semibold">{activeTelemetry.metadata?.resolutionMeters || 10}m/px</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Cloud Cover: </span>
                        <span className="text-white font-semibold">{activeTelemetry.cloudCover ?? '0.0'}%</span>
                      </div>
                    </div>
                    <div className="text-[8px] text-slate-400 truncate pt-1 border-t border-white/5">
                      Attribution: Contains modified Copernicus Sentinel data [2024], processed by ORBINEX / Element84
                    </div>

                    {/* High-res asset links */}
                    <div className="pt-1 flex items-center justify-between">
                      {activeTelemetry.visualUrl && (
                        <a
                          href={activeTelemetry.visualUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00E5FF] hover:underline flex items-center gap-1 text-[8.5px] font-semibold"
                        >
                          <span>AWS S3 COG (340 MB)</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {activeTelemetry.thumbnailUrl && (
                        <a
                          href={`/api/satellite/process?url=${encodeURIComponent(activeTelemetry.thumbnailUrl)}&stretch=true&platform=${encodeURIComponent(activeTelemetry.platform)}`}
                          download={`orbinex-${activeTelemetry.id}-processed.png`}
                          className="text-white/80 hover:text-white flex items-center gap-1 text-[8.5px] font-semibold"
                        >
                          <Download className="w-2.5 h-2.5" />
                          <span>Download PNG</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
