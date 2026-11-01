'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Database,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  ExternalLink,
  ShieldAlert,
  HardDrive,
  RefreshCw,
  FileCheck,
  Globe2,
  ChevronRight,
  Filter,
} from 'lucide-react';
import type { DatasetRecord, DatasetCategory, DatasetTier, AcquiredDatasetManifestEntry } from '@/lib/datasets/types';
import { UNIFIED_DATASET_REGISTRY, DATASET_CATEGORIES } from '@/lib/datasets/registry';

interface DatasetCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAOI?: {
    name: string;
    bbox: [number, number, number, number];
  } | null;
}

export function DatasetCatalogueModal({ isOpen, onClose, activeAOI }: DatasetCatalogueModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<DatasetCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<DatasetTier | 'all'>('all');
  const [manifest, setManifest] = useState<AcquiredDatasetManifestEntry[]>([]);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [acquiringId, setAcquiringId] = useState<string | null>(null);
  const [acquisitionSuccess, setAcquisitionSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch local manifest on mount / open
  useEffect(() => {
    if (isOpen) {
      loadLocalManifest();
    }
  }, [isOpen]);

  const loadLocalManifest = async () => {
    setLoadingManifest(true);
    try {
      const res = await fetch('/api/datasets/manifest');
      if (res.ok) {
        const data = await res.json();
        setManifest(data.manifest || []);
      }
    } catch (e) {
      console.warn('Failed to load local manifest:', e);
    } finally {
      setLoadingManifest(false);
    }
  };

  const handleAcquire = async (dataset: DatasetRecord) => {
    if (dataset.tier === 'commercial_licensed') {
      alert(`[RSK-09 Commercial Tasking Gate]\n${dataset.name} requires human purchase authorization and active commercial provider credentials. Automated non-credentialed acquisition is blocked.`);
      return;
    }

    const bbox = activeAOI?.bbox || [77.55, 12.90, 77.75, 13.15]; // Default to Bangalore AOI
    const aoiName = activeAOI?.name || 'Bangalore Metropolitan AOI';

    setAcquiringId(dataset.id);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/datasets/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: dataset.id,
          aoiBbox: bbox,
          aoiName,
          targetDate: new Date().toISOString().slice(0, 10),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setAcquisitionSuccess(dataset.name);
      setTimeout(() => setAcquisitionSuccess(null), 5000);
      await loadLocalManifest();
    } catch (err: any) {
      setErrorMsg(`Acquisition failed: ${err.message}`);
    } finally {
      setAcquiringId(null);
    }
  };

  const filteredDatasets = useMemo(() => {
    return UNIFIED_DATASET_REGISTRY.filter((d) => {
      if (selectedCategory !== 'all' && d.category !== selectedCategory) return false;
      if (selectedTier !== 'all' && d.tier !== selectedTier) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.provider.toLowerCase().includes(q) ||
          d.primaryUseCases.some((u) => u.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [selectedCategory, selectedTier, searchQuery]);

  const cachedDatasetIds = useMemo(() => {
    return new Set(manifest.map((m) => m.datasetId));
  }, [manifest]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md font-sans">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-[#090D16] border border-[#00E5FF]/40 shadow-[0_0_50px_rgba(0,229,255,0.15)] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center text-[#00E5FF]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-wide text-white">ORBINEX GEOSPATIAL DATASET CATALOGUE</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40">
                  {UNIFIED_DATASET_REGISTRY.length} Master Datasets
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Earth observation, elevation, land-use, infrastructure, water, environmental hazard, and AI training archives.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeAOI && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/50 border border-cyan-500/40 text-[11px] font-mono text-cyan-300">
                <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Active AOI: <b>{activeAOI.name}</b></span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Alert / Status Bar */}
        {acquisitionSuccess && (
          <div className="px-6 py-2.5 bg-emerald-950/80 border-b border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Successfully acquired and validated <b>{acquisitionSuccess}</b> for active AOI! Recorded in manifest.</span>
          </div>
        )}
        {errorMsg && (
          <div className="px-6 py-2.5 bg-red-950/80 border-b border-red-500/50 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="px-6 py-3 border-b border-white/10 bg-black/40 flex flex-wrap items-center justify-between gap-3">
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-[#00E5FF] text-black font-bold shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              All Categories ({UNIFIED_DATASET_REGISTRY.length})
            </button>
            {DATASET_CATEGORIES.map((cat) => {
              const count = UNIFIED_DATASET_REGISTRY.filter((d) => d.category === cat.id).length;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-[#00E5FF] text-black font-bold shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search datasets, providers..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00E5FF]"
            />
          </div>
        </div>

        {/* Dataset Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredDatasets.map((ds) => {
              const isCached = cachedDatasetIds.has(ds.id);
              const isCommercial = ds.tier === 'commercial_licensed';
              const isStreaming = ds.tier === 'cloud_streaming';
              const isAcquiring = acquiringId === ds.id;

              return (
                <div
                  key={ds.id}
                  className="rounded-xl p-4 bg-white/[0.02] border border-white/10 hover:border-[#00E5FF]/50 transition-all flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-400">
                          {ds.category.replace('_', ' ')}
                        </span>
                        <h3 className="text-sm font-bold text-white group-hover:text-[#00E5FF] transition-colors leading-snug">
                          {ds.name}
                        </h3>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 border ${
                        isCommercial
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : isStreaming
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}>
                        {isCommercial ? 'PAID / GATE' : isStreaming ? 'STREAMING' : 'ON-DEMAND'}
                      </span>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-300">
                      <span className="px-1.5 py-0.5 rounded bg-black/60 border border-white/10">
                        {ds.nativeResolution} GSD
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-black/60 border border-white/10">
                        {ds.spatialCrs}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-black/60 border border-white/10 text-cyan-300">
                        {ds.temporalCoverage}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {ds.description}
                    </p>

                    {/* Provider & License */}
                    <div className="pt-1 border-t border-white/5 text-[10px] text-slate-400 flex items-center justify-between">
                      <span className="truncate max-w-[180px]">{ds.provider}</span>
                      <span className="text-slate-500 font-mono text-[9px]">{ds.license}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                    <a
                      href={ds.documentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Docs</span>
                    </a>

                    <div className="flex items-center gap-2">
                      {isCached && (
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>CACHED</span>
                        </span>
                      )}

                      {isCommercial ? (
                        <button
                          onClick={() => handleAcquire(ds)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-300 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <ShieldAlert className="w-3 h-3 text-amber-400" />
                          <span>Task License</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAcquire(ds)}
                          disabled={isAcquiring}
                          className="px-2.5 py-1 rounded-lg bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 border border-[#00E5FF] text-[10px] font-bold text-[#00E5FF] hover:text-white flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(0,229,255,0.2)] cursor-pointer disabled:opacity-50"
                        >
                          {isAcquiring ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Acquiring...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>{isCached ? 'Re-Acquire AOI' : 'Acquire for AOI'}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Summary Stats */}
        <div className="px-6 py-3 border-t border-white/10 bg-black/50 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Manifest Cached Files: <b>{manifest.length}</b></span>
            </span>
            <span className="text-slate-600">|</span>
            <span>Total Catalogued: <b>{UNIFIED_DATASET_REGISTRY.length}</b> datasets</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLocalManifest}
              className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 flex items-center gap-1 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loadingManifest ? 'animate-spin' : ''}`} />
              <span>Refresh Manifest</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
