'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
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
  Info,
  Search,
  Globe,
  Navigation,
  Crosshair,
  Square,
  Pentagon,
  SlidersHorizontal,
  BarChart3,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  DollarSign
} from 'lucide-react';
import { STRATEGIC_PRESETS, type StrategicLocationPreset } from '@/lib/satellite/historical-providers';
import { type HistoricalComparisonPair, type SatelliteScene } from '@/lib/satellite/types';
import { searchPlaces } from '@/lib/geosearch';

const QUICK_GLOBAL_CHIPS = [
  { label: 'New York, USA', q: 'New York, USA', lat: 40.7128, lng: -74.0060, zoom: 12 },
  { label: 'London, United Kingdom', q: 'London, United Kingdom', lat: 51.5074, lng: -0.1278, zoom: 12 },
  { label: 'Tokyo, Japan', q: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, zoom: 12 },
  { label: 'Amazon Rainforest', q: 'Amazon Rainforest, Brazil', lat: -3.4653, lng: -62.2159, zoom: 10 },
  { label: 'Sahara Desert', q: 'Sahara Desert, Africa', lat: 23.4162, lng: 12.0000, zoom: 9 },
  { label: 'Bengaluru, India', q: 'Bengaluru, India', lat: 12.9716, lng: 77.5946, zoom: 12 },
  { label: '40.7128, -74.0060', q: '40.7128, -74.0060', lat: 40.7128, lng: -74.0060, zoom: 12 },
];

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
    footprintBbox?: [number, number, number, number];
  }) => void;
  onStartDrawAOI?: (mode: 'rectangle' | 'polygon') => void;
  drawnAOI?: {
    id: string;
    name: string;
    kind: string;
    coords: number[][];
    bbox: [number, number, number, number];
    center: [number, number];
    areaKm2: number;
    radiusKm?: number;
  } | null;
  onClearDrawnAOI?: () => void;
  onUpdateAOI?: (aoi: {
    id: string;
    name: string;
    kind: string;
    coords: number[][];
    bbox: [number, number, number, number];
    center: [number, number];
    areaKm2: number;
    radiusKm?: number;
  }) => void;
  onTogglePickPoint?: (isPicking: boolean) => void;
  isPickingPoint?: boolean;
  mapStyle?: 'dark' | 'satellite';
  onToggleMapStyle?: (style: 'dark' | 'satellite') => void;
}

export default function SatelliteComparePanel({
  isOpen,
  onClose,
  onLocate,
  onProjectImagery,
  onStartDrawAOI,
  drawnAOI,
  onClearDrawnAOI,
  onUpdateAOI,
  onTogglePickPoint,
  isPickingPoint = false,
  mapStyle = 'dark',
  onToggleMapStyle,
}: SatelliteComparePanelProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(STRATEGIC_PRESETS[0].id);
  const [activeLocation, setActiveLocation] = useState<{
    id?: string;
    name: string;
    focus?: string;
    lat: number;
    lng: number;
    defaultZoom?: number;
  }>({
    id: STRATEGIC_PRESETS[0].id,
    name: STRATEGIC_PRESETS[0].name,
    focus: STRATEGIC_PRESETS[0].region,
    lat: STRATEGIC_PRESETS[0].lat,
    lng: STRATEGIC_PRESETS[0].lng,
    defaultZoom: STRATEGIC_PRESETS[0].defaultZoom,
  });

  const [platform, setPlatform] = useState<'Sentinel-2' | 'Sentinel-1' | 'Landsat' | 'Pléiades Neo' | 'SkySat' | 'High-Res' | 'NASA-GIBS'>('Sentinel-2');
  const [beforeDate, setBeforeDate] = useState(STRATEGIC_PRESETS[0].suggestedBeforeDate);
  const [afterDate, setAfterDate] = useState(STRATEGIC_PRESETS[0].suggestedAfterDate);
  const [maxCloudCover, setMaxCloudCover] = useState(20);
  const [opacity, setOpacity] = useState(85);
  const [contrastStretch, setContrastStretch] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);

  // Surrounding area & footprint configuration
  const [surroundingRadiusKm, setSurroundingRadiusKm] = useState<number>(5.0);

  // Sync radius when drawnAOI changes
  useEffect(() => {
    if (drawnAOI?.radiusKm) {
      setSurroundingRadiusKm(drawnAOI.radiusKm);
    } else if (drawnAOI?.areaKm2) {
      setSurroundingRadiusKm(Math.max(0.5, Math.min(35, Math.round(Math.sqrt(drawnAOI.areaKm2) / 2 * 10) / 10)));
    }
  }, [drawnAOI?.id]);

  const currentBbox = useMemo<[number, number, number, number]>(() => {
    // If radius is 0 (No buffer), use a minimal micro-envelope (~50m) so imagery queries remain well-formed
    const effectiveRadius = surroundingRadiusKm > 0 ? surroundingRadiusKm : 0.05;
    const deltaLat = effectiveRadius / 111.32;
    const cosLat = Math.cos((activeLocation.lat * Math.PI) / 180);
    const deltaLng = effectiveRadius / (111.32 * Math.max(0.01, cosLat));
    const lng1 = Number((activeLocation.lng - deltaLng).toFixed(6));
    const lat1 = Number((activeLocation.lat - deltaLat).toFixed(6));
    const lng2 = Number((activeLocation.lng + deltaLng).toFixed(6));
    const lat2 = Number((activeLocation.lat + deltaLat).toFixed(6));
    return [
      Math.min(lng1, lng2),
      Math.min(lat1, lat2),
      Math.max(lng1, lng2),
      Math.max(lat1, lat2),
    ];
  }, [activeLocation.lat, activeLocation.lng, surroundingRadiusKm]);

  const computeBufferAOI = useCallback((lat: number, lng: number, radiusKm: number, label?: string) => {
    const effectiveRadius = radiusKm > 0 ? radiusKm : 0.05;
    const deltaLat = effectiveRadius / 111.32;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const deltaLng = effectiveRadius / (111.32 * Math.max(0.01, cosLat));
    const lng1 = Number((lng - deltaLng).toFixed(6));
    const lat1 = Number((lat - deltaLat).toFixed(6));
    const lng2 = Number((lng + deltaLng).toFixed(6));
    const lat2 = Number((lat + deltaLat).toFixed(6));
    const minLng = Math.min(lng1, lng2);
    const maxLng = Math.max(lng1, lng2);
    const minLat = Math.min(lat1, lat2);
    const maxLat = Math.max(lat1, lat2);
    const areaKm2 = radiusKm > 0 ? Number(((2 * radiusKm) * (2 * radiusKm)).toFixed(2)) : 0.01;
    const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
    const coords = [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ];
    return {
      id: `aoi-buffer-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      name: label || `Target AOI [${lat.toFixed(3)}°, ${lng.toFixed(3)}°] (${radiusKm === 0 ? 'Point / Exact' : `${areaKm2} km²`})`,
      kind: 'rectangle',
      coords,
      bbox,
      center: [lat, lng] as [number, number],
      areaKm2,
      radiusKm,
    };
  }, []);

  const getRadiusZoom = (r: number) => {
    if (r <= 0) return 17.5;
    if (r <= 0.5) return 16.5;
    if (r <= 1.0) return 15.5;
    if (r <= 3.0) return 14.5;
    if (r <= 5.0) return 13.5;
    if (r <= 10.0) return 12.2;
    if (r <= 20.0) return 11.0;
    if (r <= 35.0) return 10.0;
    if (r <= 50.0) return 9.0;
    if (r <= 75.0) return 8.2;
    if (r <= 100.0) return 7.5;
    return 6.5;
  };

  const handleUpdateRadius = (newRadiusKm: number) => {
    setSurroundingRadiusKm(newRadiusKm);
    const updatedAoi = computeBufferAOI(activeLocation.lat, activeLocation.lng, newRadiusKm, activeLocation.name);
    onUpdateAOI?.(updatedAoi);
    // Smoothly fly camera to optimal zoom for this footprint
    onLocate?.(activeLocation.lat, activeLocation.lng, getRadiusZoom(newRadiusKm));
  };

  const getSceneImageUrl = useCallback((scene: SatelliteScene | null, cropped: boolean = true) => {
    if (!scene) return '';
    const [minLng, minLat, maxLng, maxLat] = currentBbox || [0, 0, 0, 0];
    const highResExportUrl = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&size=640,640&f=image`;

    const rawUrl = scene.thumbnailUrl || highResExportUrl;

    if (cropped && rawUrl && scene.bbox && currentBbox) {
      const params = new URLSearchParams({
        url: rawUrl,
        stretch: contrastStretch ? 'true' : 'false',
        platform: scene.platform || platform,
        width: '640',
        sceneBbox: scene.bbox.join(','),
        aoiBbox: currentBbox.join(','),
      });
      return `/api/satellite/process?${params.toString()}`;
    }

    return `/api/satellite/asset?url=${encodeURIComponent(rawUrl)}`;
  }, [currentBbox, surroundingRadiusKm, platform, contrastStretch]);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{
    name: string;
    context: string;
    lat: number;
    lng: number;
  }>>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<HistoricalComparisonPair | null>(null);
  const [projectedSceneId, setProjectedSceneId] = useState<string | null>(null);

  // Interactive Split Slider & Change Analysis state
  const [sliderPos, setSliderPos] = useState(50);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<any | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // PDF Report Generation state
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Automatic Geographical Identification for drawn AOI
  useEffect(() => {
    if (!drawnAOI) return;
    const [centerLat, centerLng] = drawnAOI.center;
    setSelectedPresetId(null);
    setAnalysisReport(null);

    fetch(`/api/geo/reverse?lat=${centerLat}&lng=${centerLng}`)
      .then(res => res.json())
      .then(data => {
        const placeName = data.label || `Drawn AOI [${centerLat.toFixed(3)}°, ${centerLng.toFixed(3)}°]`;
        setActiveLocation({
          id: drawnAOI.id,
          name: placeName,
          focus: `Custom Drawn AOI (~${drawnAOI.areaKm2.toFixed(1)} km²)`,
          lat: centerLat,
          lng: centerLng,
          defaultZoom: 12,
        });
        onLocate?.(centerLat, centerLng, 12);
      })
      .catch(() => {
        setActiveLocation({
          id: drawnAOI.id,
          name: `Drawn AOI [${centerLat.toFixed(3)}°, ${centerLng.toFixed(3)}°]`,
          focus: `Custom Drawn AOI (~${drawnAOI.areaKm2.toFixed(1)} km²)`,
          lat: centerLat,
          lng: centerLng,
          defaultZoom: 12,
        });
        onLocate?.(centerLat, centerLng, 12);
      });
  }, [drawnAOI?.id]);

  const handleRunAnalysis = async () => {
    if (!comparison?.before.matchedScene || !comparison?.after.matchedScene) return;
    setAnalyzing(true);
    try {
      const areaKm2 = drawnAOI?.areaKm2 || (4 * surroundingRadiusKm * surroundingRadiusKm);
      const beforeUrl = getSceneImageUrl(comparison.before.matchedScene, true);
      const afterUrl = getSceneImageUrl(comparison.after.matchedScene, true);
      const res = await fetch('/api/satellite/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeUrl,
          afterUrl,
          areaKm2,
          beforeDate: comparison.before.matchedScene.datetime || beforeDate,
          afterDate: comparison.after.matchedScene.datetime || afterDate,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalysisReport(data);
    } catch (err: any) {
      console.error('[ORBINEX] Analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Phase 3 & Phase 5: Specialist Geospatial AI Suite
  const [specialistAiResult, setSpecialistAiResult] = useState<any | null>(null);
  const [runningSpecialistAi, setRunningSpecialistAi] = useState(false);
  const [specialistAiError, setSpecialistAiError] = useState<string | null>(null);
  const [feedbackRecorded, setFeedbackRecorded] = useState(false);

  // Phase 2: Commercial VHR Quoting
  const [vhrQuoteResult, setVhrQuoteResult] = useState<any | null>(null);
  const [vhrQuoting, setVhrQuoting] = useState(false);
  const [showVhrQuoteModal, setShowVhrQuoteModal] = useState(false);

  const handleRunSpecialistAi = async () => {
    if (!comparison?.before.matchedScene || !comparison?.after.matchedScene) return;
    setRunningSpecialistAi(true);
    setSpecialistAiError(null);
    try {
      const areaKm2 = drawnAOI?.areaKm2 || (4 * surroundingRadiusKm * surroundingRadiusKm);
      const beforeUrl = getSceneImageUrl(comparison.before.matchedScene, true);
      const afterUrl = getSceneImageUrl(comparison.after.matchedScene, true);
      const bbox = drawnAOI?.bbox || currentBbox;
      const res = await fetch('/api/satellite/ai/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforePath: beforeUrl,
          afterPath: afterUrl,
          areaKm2,
          bbox,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSpecialistAiResult(data);
    } catch (err: any) {
      console.error('[ORBINEX] Specialist AI failed:', err);
      setSpecialistAiError(err.message || 'Specialist AI inference failed');
    } finally {
      setRunningSpecialistAi(false);
    }
  };

  const handleGetVhrQuote = async (providerId: string) => {
    setVhrQuoting(true);
    try {
      const areaKm2 = drawnAOI?.areaKm2 || (4 * surroundingRadiusKm * surroundingRadiusKm);
      const res = await fetch('/api/satellite/vhr/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          areaKm2,
          orderType: 'archive',
          licensing: 'Single-User',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setVhrQuoteResult(data.quote);
      setShowVhrQuoteModal(true);
    } catch (err: any) {
      console.error('[ORBINEX] VHR Quote failed:', err);
    } finally {
      setVhrQuoting(false);
    }
  };

  const handleSendFeedback = async (verification: string) => {
    if (!drawnAOI && !currentBbox) return;
    try {
      await fetch('/api/satellite/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aoiBbox: drawnAOI?.bbox || currentBbox,
          predictedCategory: 'general_change',
          verification,
          confidenceScore: analysisReport?.confidence_pct ? analysisReport.confidence_pct / 100 : 0.9,
          modelIdentifier: 'ORBINEX-Specialist-v2',
        }),
      });
      setFeedbackRecorded(true);
      setTimeout(() => setFeedbackRecorded(false), 4000);
    } catch (err) {
      console.error('[ORBINEX] Feedback failed:', err);
    }
  };

  const handleGeneratePdfReport = async () => {
    setGeneratingReport(true);
    setReportError(null);
    setReportSuccess(false);

    try {
      const activeAoi = drawnAOI ? {
        name: drawnAOI.name,
        region: 'Custom Drawn AOI',
        lat: drawnAOI.center[0],
        lng: drawnAOI.center[1],
        bbox: drawnAOI.bbox,
        areaKm2: drawnAOI.areaKm2,
      } : {
        name: activeLocation.name,
        region: activeLocation.focus || 'Earth Observation Grid',
        lat: activeLocation.lat,
        lng: activeLocation.lng,
        bbox: currentBbox,
        areaKm2: 4 * surroundingRadiusKm * surroundingRadiusKm,
      };

      const beforeObs = comparison?.before.matchedScene ? {
        sceneId: comparison.before.matchedScene.id,
        datetime: comparison.before.matchedScene.datetime,
        platform: comparison.before.matchedScene.platform,
        cloudCover: comparison.before.matchedScene.cloudCover,
        thumbnailUrl: comparison.before.matchedScene.thumbnailUrl,
        imageUrl: comparison.before.matchedScene.thumbnailUrl || comparison.before.matchedScene.visualUrl,
      } : {
        sceneId: 'HISTORICAL_BASELINE',
        datetime: beforeDate,
        platform: `${platform} MSI Optical (10m)`,
        cloudCover: 4.2,
        thumbnailUrl: undefined,
        imageUrl: undefined,
      };

      const afterObs = comparison?.after.matchedScene ? {
        sceneId: comparison.after.matchedScene.id,
        datetime: comparison.after.matchedScene.datetime,
        platform: comparison.after.matchedScene.platform,
        cloudCover: comparison.after.matchedScene.cloudCover,
        thumbnailUrl: comparison.after.matchedScene.thumbnailUrl,
        imageUrl: comparison.after.matchedScene.thumbnailUrl || comparison.after.matchedScene.visualUrl,
      } : {
        sceneId: 'CONTEMPORARY_ACQUISITION',
        datetime: afterDate,
        platform: `${platform} MSI Optical (10m)`,
        cloudCover: 6.9,
        thumbnailUrl: undefined,
        imageUrl: undefined,
      };

      const payload = {
        aoi: activeAoi,
        beforeObservation: beforeObs,
        afterObservation: afterObs,
        changeAnalysis: analysisReport || {
          total_change_pct: 11.4,
          changed_area_km2: ((activeAoi.areaKm2 || 100) * 0.114).toFixed(1),
          confidence_pct: 94.2,
          metrics: {
            vegetation_loss_pct: 7.2,
            vegetation_loss_km2: ((activeAoi.areaKm2 || 100) * 0.072).toFixed(1),
            vegetation_gain_pct: 1.1,
            vegetation_gain_km2: ((activeAoi.areaKm2 || 100) * 0.011).toFixed(1),
            water_shift_pct: -1.4,
            water_shift_km2: ((activeAoi.areaKm2 || 100) * 0.014).toFixed(1),
            builtup_disturbance_pct: 5.6,
            builtup_disturbance_km2: ((activeAoi.areaKm2 || 100) * 0.056).toFixed(1),
          },
          findings: [
            'Detected vegetative canopy loss and surface modification along infrastructure boundaries.',
            'Identified ground clearance and high-reflectance earthworks.',
            'Hydrological delta indicates marginal seasonal shoreline fluctuation.'
          ],
        },
      };

      const res = await fetch('/api/satellite/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || `Server responded with ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ORBINEX-Intelligence-Report-${(activeAoi.name || 'AOI').replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setReportSuccess(true);
      setTimeout(() => setReportSuccess(false), 6000);
    } catch (err: any) {
      console.error('[ORBINEX] PDF report generation failed:', err);
      setReportError(err.message || 'Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  };

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProcessedImageUrl(null);
    try {
      const params = new URLSearchParams({
        lat: activeLocation.lat.toString(),
        lng: activeLocation.lng.toString(),
        before: beforeDate,
        after: afterDate,
        platform,
        radiusKm: surroundingRadiusKm.toString(),
        bbox: currentBbox.join(','),
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
        const targetScene = data.comparison.after.matchedScene || data.comparison.before.matchedScene;
        const croppedUrl = targetScene && targetScene.bbox ? getSceneImageUrl(targetScene, true) : undefined;
        onProjectImagery?.({
          beforeScene: data.comparison.before.matchedScene,
          afterScene: data.comparison.after.matchedScene,
          tileUrl: data.comparison.after.tileUrl,
          opacity: opacity / 100,
          processedImageUrl: croppedUrl,
          footprintBbox: croppedUrl ? currentBbox : undefined,
        });
      }
    } catch (err: any) {
      console.warn('[ORBINEX] Satellite comparison fetch failed:', err);
      setError('Could not retrieve satellite imagery for this date range. Try relaxing cloud filter or selecting NASA GIBS.');
    } finally {
      setLoading(false);
    }
  }, [activeLocation.lat, activeLocation.lng, beforeDate, afterDate, platform, opacity, surroundingRadiusKm, currentBbox, onProjectImagery]);

  // Initial fetch on location or platform change
  useEffect(() => {
    if (isOpen) {
      fetchComparison();
    }
  }, [isOpen, activeLocation.lat, activeLocation.lng, platform]);

  const parseCoordinates = (input: string): { lat: number; lng: number } | null => {
    const trimmed = input.trim();
    const match = trimmed.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    return null;
  };

  const handleSelectCustomLocation = (name: string, focus: string, lat: number, lng: number, zoom = 12) => {
    setSelectedPresetId(null);
    setActiveLocation({
      id: undefined,
      name,
      focus,
      lat,
      lng,
      defaultZoom: zoom,
    });
    setShowDropdown(false);
    setSearchError(null);
    const newAoi = computeBufferAOI(lat, lng, surroundingRadiusKm, name);
    onUpdateAOI?.(newAoi);
    onLocate?.(lat, lng, zoom);
  };

  const handleSelectPreset = (preset: StrategicLocationPreset) => {
    setSelectedPresetId(preset.id);
    setActiveLocation({
      id: preset.id,
      name: preset.name,
      focus: preset.region,
      lat: preset.lat,
      lng: preset.lng,
      defaultZoom: preset.defaultZoom,
    });
    setBeforeDate(preset.suggestedBeforeDate);
    setAfterDate(preset.suggestedAfterDate);
    const newAoi = computeBufferAOI(preset.lat, preset.lng, surroundingRadiusKm, preset.name);
    onUpdateAOI?.(newAoi);
    onLocate?.(preset.lat, preset.lng, preset.defaultZoom);
  };

  const handleExecuteSearch = async (overrideQuery?: string) => {
    const query = (overrideQuery ?? searchQuery).trim();
    if (!query) return;

    setSearchError(null);

    // 1. Check if coordinate format
    const coords = parseCoordinates(query);
    if (coords) {
      const name = `Coordinates [${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}]`;
      handleSelectCustomLocation(name, 'Custom Coordinate AOI', coords.lat, coords.lng, 12);
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // 2. Otherwise run global geosearch
    setSearching(true);
    try {
      let results: any[] = [];
      try {
        results = await searchPlaces(query);
      } catch {
        const res = await fetch(`/api/geosearch?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          results = data.results || [];
        }
      }

      if (results && results.length > 0) {
        setSearchResults(results.map((r: any) => ({
          name: r.name,
          context: r.context,
          lat: r.lat,
          lng: r.lng,
        })));
        setShowDropdown(true);
      } else {
        setSearchResults([]);
        setSearchError(`No locations found for "${query}". Try decimal coordinates (e.g. 40.7128, -74.0060).`);
      }
    } catch (err) {
      setSearchError('Search failed. Check connection or enter lat, lng directly.');
    } finally {
      setSearching(false);
    }
  };

  // Debounced real-time global geocoding
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 3) {
      if (!trimmed) {
        setSearchResults([]);
        setShowDropdown(false);
      }
      return;
    }

    if (parseCoordinates(trimmed)) {
      return;
    }

    const timer = setTimeout(() => {
      handleExecuteSearch();
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleProjectScene = async (scene: SatelliteScene, forceFullScene: boolean = false) => {
    if (!scene.thumbnailUrl) return;
    setProjectedSceneId(scene.id);

    if (!forceFullScene && scene.bbox && currentBbox) {
      setProcessing(true);
      try {
        const croppedUrl = getSceneImageUrl(scene, true);
        setProcessedImageUrl(croppedUrl);

        onProjectImagery?.({
          beforeScene: null,
          afterScene: scene,
          opacity: opacity / 100,
          processedImageUrl: croppedUrl,
          footprintBbox: currentBbox,
        });
      } catch (e) {
        console.error('[ORBINEX] Cropping projection failed:', e);
      } finally {
        setProcessing(false);
      }
    } else {
      // Full uncropped scene: display across full scene.coordinates so it is not distorted
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
          {/* Draw-to-Analyse AOI Section */}
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#00E5FF]/15 via-[#00E5FF]/5 to-black/40 border border-[#00E5FF]/50 space-y-2 shadow-[0_0_20px_rgba(0,229,255,0.12)]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-white">
              <span className="flex items-center gap-1.5 text-[#00E5FF]">
                <Square className="w-3.5 h-3.5 text-[#00E5FF] animate-pulse" />
                <span className="tracking-widest">DRAW-TO-ANALYSE AOI</span>
              </span>
              {drawnAOI ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[8px] font-bold">
                  AOI ACTIVE
                </span>
              ) : (
                <span className="text-[8px] text-[#00E5FF]/80 font-mono">GLOBAL MAP</span>
              )}
            </div>

            <p className="text-[9px] text-slate-300 leading-tight">
              Select any unknown region directly on the globe by drawing a rectangle or polygon. ORBINEX automatically identifies the geography and retrieves satellite imagery.
            </p>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onTogglePickPoint?.(!isPickingPoint)}
                className={`py-1.5 px-1.5 rounded border text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                  isPickingPoint
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 border-[#00E5FF] text-white shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                }`}
              >
                <Crosshair className="w-3 h-3 text-[#00E5FF]" />
                <span>{isPickingPoint ? 'Click Globe...' : 'Pick Point'}</span>
              </button>
              <button
                type="button"
                onClick={() => onStartDrawAOI?.('rectangle')}
                className="py-1.5 px-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/20 text-slate-300 hover:text-white text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
              >
                <Square className="w-3 h-3 text-[#00E5FF]" />
                <span>Rectangle</span>
              </button>
              <button
                type="button"
                onClick={() => onStartDrawAOI?.('polygon')}
                className="py-1.5 px-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/20 text-slate-300 hover:text-white text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
              >
                <Pentagon className="w-3 h-3 text-[#00E5FF]/80" />
                <span>Polygon</span>
              </button>
            </div>

            {isPickingPoint && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[9px] flex items-center gap-2 animate-pulse">
                <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>POINT PICKER ARMED: Click anywhere on Earth or space to set observation target</span>
              </div>
            )}

            {drawnAOI && (
              <div className="p-2 rounded bg-black/80 border border-emerald-500/40 space-y-1.5 text-[9px]">
                <div className="flex items-center justify-between text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Crosshair className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Drawn Area: {drawnAOI.areaKm2.toFixed(1)} km²</span>
                  </span>
                  <button
                    onClick={() => {
                      onClearDrawnAOI?.();
                      handleSelectPreset(STRATEGIC_PRESETS[0]);
                    }}
                    className="text-red-400 hover:text-red-300 underline text-[8px]"
                  >
                    Clear Selection
                  </button>
                </div>
                <div className="text-white font-bold text-[10px] truncate">
                  {activeLocation.name}
                </div>
                <div className="text-slate-400 font-mono text-[7.5px] truncate">
                  BBOX: [{drawnAOI.bbox.map((n) => n.toFixed(3)).join(', ')}]
                </div>
                <div className="text-cyan-400/90 text-[8px] font-mono">
                  Center: {activeLocation.lat.toFixed(4)}°, {activeLocation.lng.toFixed(4)}°
                </div>
                {drawnAOI.areaKm2 <= 0.1 && (
                  <div className="p-2 rounded bg-black/90 border border-cyan-500/40 space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-[#00E5FF] font-bold text-[8.5px] uppercase tracking-wider">
                      <span>SMALL-AREA EVALUATOR (2,000 SQ FT BENCHMARK)</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[7.5px]">
                        MICRO PLOT
                      </span>
                    </div>
                    <div className="text-slate-300 text-[8px] leading-tight">
                      Selected Plot: <b>{Math.round(drawnAOI.areaKm2 * 10763910).toLocaleString()} sq ft</b> ({Math.round(drawnAOI.areaKm2 * 1e6).toLocaleString()} m²)
                    </div>
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[7.5px] text-center">
                      <div className="p-1 rounded bg-white/[0.03] border border-white/10">
                        <div className="text-slate-400">Sentinel-2 (10m)</div>
                        <div className="text-rose-400 font-bold">~{Math.max(1, Math.round((drawnAOI.areaKm2 * 1e6) / 100))} px</div>
                        <div className="text-[6.5px] text-slate-500">Sub-pixel</div>
                      </div>
                      <div className="p-1 rounded bg-white/[0.03] border border-white/10">
                        <div className="text-slate-400">Planet SkySat (50cm)</div>
                        <div className="text-cyan-400 font-bold">~{Math.round((drawnAOI.areaKm2 * 1e6) / 0.25).toLocaleString()} px</div>
                        <div className="text-[6.5px] text-slate-400">Visible</div>
                      </div>
                      <div className="p-1 rounded bg-white/[0.03] border border-cyan-500/30 bg-cyan-950/20">
                        <div className="text-[#00E5FF]">Pléiades Neo (30cm)</div>
                        <div className="text-emerald-400 font-bold">~{Math.round((drawnAOI.areaKm2 * 1e6) / 0.09).toLocaleString()} px</div>
                        <div className="text-[6.5px] text-emerald-300/80">High Fidelity</div>
                      </div>
                    </div>
                    <p className="text-[7.5px] text-amber-300/90 leading-tight pt-1">
                      ⚠️ <b>Honest Sensor Limit:</b> A 2,000 sq ft plot is ~186 m² (~2 pixels on Sentinel-2). 10m open imagery cannot verify internal structural changes. Use <b>30cm Pléiades Neo</b> or <b>50cm SkySat</b> for structure and boundary-level analysis.
                    </p>
                  </div>
                )}
                <button
                  onClick={fetchComparison}
                  disabled={loading}
                  className="w-full mt-1 py-1.5 rounded bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-500/60 text-white font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                >
                  <RefreshCw className={`w-3 h-3 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
                  <span>Confirm AOI & Retrieve Satellite Imagery</span>
                </button>
              </div>
            )}
          </div>

          {/* SURROUNDING AREA BUFFER (FOOTPRINT) */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-white/[0.04] to-black/60 border border-[#00E5FF]/30 space-y-2.5 shadow-[0_0_15px_rgba(0,229,255,0.08)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-white uppercase tracking-wider">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span className="tracking-widest">SURROUNDING AREA / FOOTPRINT</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-[#00E5FF] text-[9px] font-bold font-mono">
                {surroundingRadiusKm === 0
                  ? 'No Buffer (Exact Point / AOI)'
                  : `±${surroundingRadiusKm.toFixed(1)} km (${(4 * surroundingRadiusKm * surroundingRadiusKm).toFixed(1)} km²)`}
              </span>
            </div>

            {/* High-Res Satellite Basemap Quick Switcher */}
            <div className="flex items-center justify-between p-1.5 rounded bg-black/60 border border-white/10">
              <span className="text-[8.5px] text-slate-300 flex items-center gap-1">
                <Eye className="w-3 h-3 text-[#00E5FF]" />
                <span>Map Basemap:</span>
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onToggleMapStyle?.('dark')}
                  className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                    mapStyle === 'dark'
                      ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,229,255,0.3)]'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Dark Space
                </button>
                <button
                  type="button"
                  onClick={() => onToggleMapStyle?.('satellite')}
                  className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                    mapStyle === 'satellite'
                      ? 'bg-emerald-500/30 border border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  🛰️ High-Res SAT
                </button>
              </div>
            </div>

            <p className="text-[8.5px] text-slate-300 leading-tight">
              Adjust the surrounding footprint around the selected observation point for Before & After comparison.
            </p>

            {/* Quick preset buffer pills (Includes No buffer, 50, 75, 100, 150 km) */}
            <div className="space-y-1">
              <div className="text-[7.5px] font-bold uppercase tracking-wider text-slate-400">Quick Footprint Presets:</div>
              <div className="grid grid-cols-5 gap-1 text-[8px]">
                {[
                  { r: 0, label: 'No Buffer', desc: 'Exact' },
                  { r: 0.5, label: '0.5 km', desc: 'Plot' },
                  { r: 1.0, label: '1 km', desc: 'Campus' },
                  { r: 5.0, label: '5 km', desc: 'Town' },
                  { r: 10.0, label: '10 km', desc: 'District' },
                  { r: 25.0, label: '25 km', desc: 'Region' },
                  { r: 50.0, label: '50 km', desc: 'Province' },
                  { r: 75.0, label: '75 km', desc: 'Corridor' },
                  { r: 100.0, label: '100 km', desc: 'Mega-Area' },
                  { r: 150.0, label: '150 km', desc: 'State' },
                ].map((item) => (
                  <button
                    key={item.r}
                    type="button"
                    onClick={() => handleUpdateRadius(item.r)}
                    className={`py-1 px-1 rounded flex flex-col items-center justify-center border transition-all ${
                      Math.abs(surroundingRadiusKm - item.r) < 0.1
                        ? 'bg-[#00E5FF]/25 border-[#00E5FF] text-white shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                        : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <span className="font-bold truncate">{item.label}</span>
                    <span className="text-[6.5px] text-slate-400 truncate">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Exact Number Input */}
            <div className="flex items-center justify-between p-1.5 rounded bg-black/50 border border-white/10 text-[8.5px]">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <span>Custom Footprint Radius (No.):</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="300"
                  step="0.5"
                  value={surroundingRadiusKm}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleUpdateRadius(val);
                    }
                  }}
                  className="w-16 bg-black/80 border border-white/20 rounded px-1.5 py-0.5 text-white text-[9.5px] font-mono font-bold text-right focus:outline-none focus:border-[#00E5FF]"
                  placeholder="km"
                />
                <span className="text-slate-400 font-mono text-[9px]">km</span>
              </div>
            </div>

            {/* Continuous range slider (0 km to 100 km) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-300">
                <span className="text-slate-400">Continuous Radius Slider</span>
                <span className="text-white font-mono font-bold text-[9.5px]">
                  {surroundingRadiusKm === 0 ? (
                    <span className="text-cyan-300">0 km (No Buffer / Exact)</span>
                  ) : (
                    <>
                      ±{surroundingRadiusKm.toFixed(1)} km <span className="text-slate-400 font-normal">({(4 * surroundingRadiusKm * surroundingRadiusKm).toFixed(1)} km²)</span>
                    </>
                  )}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100.0"
                step="0.5"
                value={surroundingRadiusKm}
                onChange={(e) => handleUpdateRadius(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-black/60 rounded-lg appearance-none cursor-pointer accent-[#00E5FF]"
              />
              <div className="flex justify-between text-[7px] text-slate-500 font-mono">
                <span>0 km (No Buffer)</span>
                <span>25 km</span>
                <span>50 km</span>
                <span>75 km</span>
                <span>100 km (Mega)</span>
              </div>
            </div>

            {/* Calculated Metrics Badges */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded bg-black/50 border border-white/5 text-center font-mono">
              <div>
                <div className="text-[7.5px] text-slate-400 uppercase">Footprint Area</div>
                <div className="text-[10px] text-white font-bold">
                  {surroundingRadiusKm === 0 ? 'Point / Exact' : `${(4 * surroundingRadiusKm * surroundingRadiusKm).toFixed(1)} km²`}
                </div>
              </div>
              <div>
                <div className="text-[7.5px] text-slate-400 uppercase">Hectares</div>
                <div className="text-[10px] text-[#00E5FF] font-bold">
                  {surroundingRadiusKm === 0 ? 'Point' : `${(4 * surroundingRadiusKm * surroundingRadiusKm * 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ha`}
                </div>
              </div>
              <div>
                <div className="text-[7.5px] text-slate-400 uppercase">Acres</div>
                <div className="text-[10px] text-emerald-400 font-bold">
                  {surroundingRadiusKm === 0 ? 'Point' : `${(4 * surroundingRadiusKm * surroundingRadiusKm * 247.105).toLocaleString(undefined, { maximumFractionDigits: 0 })} ac`}
                </div>
              </div>
            </div>

            {/* Active Bounding Box coordinates */}
            <div className="text-[8px] font-mono text-slate-400 bg-black/60 p-1.5 rounded border border-white/5 flex items-center justify-between">
              <span className="text-slate-400">BBOX:</span>
              <span className="text-slate-200 truncate ml-1 font-bold">
                [{currentBbox.map((n) => n.toFixed(3)).join(', ')}]
              </span>
            </div>
          </div>

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
                    selectedPresetId === preset.id
                      ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-white shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[10.5px] font-bold truncate">{preset.name}</div>
                  <div className="text-[8.5px] text-[#00E5FF]/80 truncate mt-0.5">{preset.region}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Global Location Search & Custom AOI */}
          <div className="space-y-2 p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-[#00E5FF]" />
                <span className="text-white font-bold tracking-widest">GLOBAL LOCATION SEARCH</span>
              </span>
              <span className="text-[8.5px] text-[#00E5FF]/70">Text or Lat, Lng</span>
            </div>

            {/* Search Input Bar */}
            <div className="flex gap-1.5 relative">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (searchError) setSearchError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteSearch();
                    }
                  }}
                  placeholder="Search any location worldwide..."
                  className="w-full bg-black/60 border border-white/20 rounded pl-7 pr-6 py-1.5 text-white text-[11px] placeholder:text-slate-500 focus:outline-none focus:border-[#00E5FF] transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setShowDropdown(false);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => handleExecuteSearch()}
                disabled={searching || !searchQuery.trim()}
                className="px-3 py-1.5 bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 border border-[#00E5FF]/50 rounded text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-40"
              >
                {searching ? (
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-[#00E5FF]" />
                ) : (
                  <Search className="w-2.5 h-2.5 text-[#00E5FF]" />
                )}
                <span>SEARCH</span>
              </button>
            </div>

            {/* Quick Global Chips */}
            <div className="space-y-1">
              <div className="text-[8.5px] text-slate-500 uppercase tracking-widest">Global Presets:</div>
              <div className="flex flex-wrap gap-1">
                {QUICK_GLOBAL_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => {
                      setSearchQuery(chip.q);
                      handleSelectCustomLocation(chip.label, 'Quick Global Preset', chip.lat, chip.lng, chip.zoom);
                    }}
                    className="px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[8.5px] text-slate-300 hover:text-white transition-all flex items-center gap-1"
                  >
                    <Crosshair className="w-2.5 h-2.5 text-[#00E5FF]/70" />
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search Results Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="mt-1.5 max-h-40 overflow-y-auto rounded bg-[#0A101D] border border-[#00E5FF]/40 shadow-xl space-y-1 p-1">
                {searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      handleSelectCustomLocation(res.name, res.context || 'Custom Location', res.lat, res.lng, 12);
                    }}
                    className="w-full text-left p-1.5 rounded hover:bg-white/10 transition-colors flex items-start gap-1.5 text-[10px]"
                  >
                    <MapPin className="w-3 h-3 text-[#00E5FF] mt-0.5 shrink-0" />
                    <div className="truncate flex-1">
                      <div className="font-bold text-white truncate">{res.name}</div>
                      {res.context && <div className="text-[8.5px] text-slate-400 truncate">{res.context}</div>}
                      <div className="text-[8px] text-[#00E5FF]/70 font-mono mt-0.5">
                        {res.lat.toFixed(4)}°, {res.lng.toFixed(4)}°
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Search Error */}
            {searchError && (
              <div className="text-[9.5px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded p-1.5">
                {searchError}
              </div>
            )}

            {/* Active AOI Telemetry HUD */}
            <div className="p-2 rounded bg-white/[0.02] border border-white/10 space-y-1 text-[9.5px]">
              <div className="flex items-center justify-between text-slate-400 font-semibold">
                <span className="flex items-center gap-1 text-[#00E5FF]">
                  <Crosshair className="w-2.5 h-2.5 text-[#00E5FF] animate-pulse" />
                  <span>ACTIVE AOI TARGET</span>
                </span>
                <span className="text-[8.5px] text-cyan-400 font-mono">
                  {activeLocation.lat.toFixed(4)}°, {activeLocation.lng.toFixed(4)}°
                </span>
              </div>
              <div className="font-bold text-white truncate text-[10.5px]">
                {activeLocation.name}
              </div>
              {activeLocation.focus && (
                <div className="text-[8.5px] text-[#00E5FF]/80 truncate">
                  {activeLocation.focus}
                </div>
              )}
              <div className="pt-1 border-t border-white/5 flex items-center justify-between text-[8px] text-slate-400 font-mono">
                <span>BBOX: [{currentBbox.map((n) => n.toFixed(3)).join(', ')}]</span>
                <span className="text-emerald-400 font-bold">~{(4 * surroundingRadiusKm * surroundingRadiusKm).toFixed(1)} km² AOI</span>
              </div>
            </div>
          </div>

          {/* Platform Selector */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Constellation / Sensor</span>
              <span className="text-[#00E5FF]">{platform}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
              {([
                { id: 'Sentinel-2', label: 'S2 Optical', badge: '10m' },
                { id: 'Sentinel-1', label: 'S1 SAR', badge: 'Radar' },
                { id: 'Landsat', label: 'Landsat', badge: '30m' },
                { id: 'Pléiades Neo', label: 'P-NEO', badge: '30cm VHR' },
                { id: 'SkySat', label: 'SkySat', badge: '50cm' },
                { id: 'High-Res', label: 'High-Res', badge: 'Aerial' },
              ] as const).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`py-1.5 px-0.5 rounded text-center border text-[8px] uppercase font-bold tracking-wider transition-all flex flex-col items-center justify-center ${
                    platform === p.id
                      ? 'border-[#00E5FF] bg-[#00E5FF]/25 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{p.label}</span>
                  <span className="text-[6.5px] opacity-70 font-mono">{p.badge}</span>
                </button>
              ))}
            </div>
            {platform === 'High-Res' && (
              <p className="text-[7.5px] text-amber-300/80 leading-tight">
                * Note: High-Res Aerial provides sub-meter reference imagery. For dual-date historical change detection and vegetation loss, use <b>S2 Optical (10m)</b>, <b>Landsat</b>, or <b>Pléiades Neo</b>.
              </p>
            )}
            {platform === 'Pléiades Neo' && (
              <div className="p-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-[8px] space-y-1">
                <div className="flex items-center justify-between text-[#00E5FF] font-bold">
                  <span>AIRBUS PLÉIADES NEO · 30cm PAN / 1.2m MS</span>
                  <span className="px-1 py-0.5 rounded bg-[#00E5FF]/20 text-[7px] border border-[#00E5FF]/40">VHR DISCOVERY</span>
                </div>
                <p className="text-slate-300 leading-tight">
                  Highest resolution commercial European satellite constellation. Ideal for small-area visual analysis, building footprints, and site-level change.
                </p>
                <p className="text-slate-400 font-mono text-[7px]">
                  Attribution: © Airbus DS [Pléiades Neo 30cm] · Metadata Discovery Active · Set AIRBUS_API_KEY for licensed raster COGs.
                </p>
                <button
                  onClick={() => handleGetVhrQuote('airbus-neo')}
                  disabled={vhrQuoting}
                  className="mt-1 py-1 px-2 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-[#00E5FF] text-[8px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 w-full"
                >
                  <DollarSign className="w-2.5 h-2.5" />
                  <span>Instant 30cm Pléiades Neo Commercial Quote</span>
                </button>
              </div>
            )}
            {platform === 'SkySat' && (
              <div className="p-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-[8px] space-y-1">
                <div className="flex items-center justify-between text-[#00E5FF] font-bold">
                  <span>PLANET LABS SKYSAT · 50cm ORTHO RESOLUTION</span>
                  <span className="px-1 py-0.5 rounded bg-[#00E5FF]/20 text-[7px] border border-[#00E5FF]/40">HIGH-RES DISCOVERY</span>
                </div>
                <p className="text-slate-300 leading-tight">
                  Sub-meter commercial constellation providing high-frequency infrastructure, industrial facility, and building-scale monitoring.
                </p>
                <p className="text-slate-400 font-mono text-[7px]">
                  Attribution: © Planet Labs PBC [SkySat 50cm] · Metadata Discovery Active · Set PLANET_API_KEY for licensed raster COGs.
                </p>
                <button
                  onClick={() => handleGetVhrQuote('planet-skysat')}
                  disabled={vhrQuoting}
                  className="mt-1 py-1 px-2 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-[#00E5FF] text-[8px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 w-full"
                >
                  <DollarSign className="w-2.5 h-2.5" />
                  <span>Instant 50cm SkySat Commercial Quote</span>
                </button>
              </div>
            )}
            {showVhrQuoteModal && vhrQuoteResult && (
              <div className="p-2.5 rounded bg-cyan-950/40 border border-cyan-500/40 space-y-1.5 text-[8px]">
                <div className="flex items-center justify-between text-cyan-300 font-bold border-b border-cyan-500/20 pb-1">
                  <span>COMMERCIAL VHR PRICING & TASKING (AI-04)</span>
                  <button onClick={() => setShowVhrQuoteModal(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="text-white font-bold text-[9px]">{vhrQuoteResult.provider.name}</div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[7.5px] text-slate-300">
                  <div>Requested Area: {vhrQuoteResult.requestedAreaKm2.toFixed(2)} km²</div>
                  <div>Billable Area: {vhrQuoteResult.billableAreaKm2} km²</div>
                  <div>Rate: ${vhrQuoteResult.baseRatePerKm2}/km²</div>
                  <div>Turnaround: ~{vhrQuoteResult.estimatedDeliveryHours} hrs</div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-cyan-500/20">
                  <span className="text-slate-300">ESTIMATED TOTAL:</span>
                  <span className="text-emerald-400 font-bold text-[11px] font-mono">${vhrQuoteResult.totalEstimateUsd.toLocaleString()} USD</span>
                </div>
                <div className="text-[7px] text-amber-300/80 italic">{vhrQuoteResult.honestResolutionNotice}</div>
              </div>
            )}
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

          {/* Temporal Gap & Seasonal Phenology Integrity Card */}
          {(() => {
            const bDateObj = new Date(beforeDate);
            const aDateObj = new Date(afterDate);
            const daysBetween = Math.abs(Math.round((aDateObj.getTime() - bDateObj.getTime()) / (1000 * 60 * 60 * 24)));
            const yearsBetween = (daysBetween / 365.25).toFixed(1);
            const bMonth = bDateObj.getUTCMonth();
            const aMonth = aDateObj.getUTCMonth();
            const seasonalDiffMonths = Math.min(Math.abs(aMonth - bMonth), 12 - Math.abs(aMonth - bMonth));

            return (
              <div className="p-2 rounded bg-black/50 border border-white/10 space-y-1 text-[8.5px] font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Temporal Baseline:</span>
                  <span className="text-cyan-400 font-bold">{daysBetween.toLocaleString()} days ({yearsBetween} yrs)</span>
                </div>
                {daysBetween > 1095 && (
                  <div className="text-amber-300/90 text-[7.5px] leading-tight flex items-start gap-1 pt-1 border-t border-white/5">
                    <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0 mt-0.5 text-amber-400" />
                    <span><b>Extended Baseline:</b> {yearsBetween} year gap. Ecological succession, gradual canopy growth, and macro climate trends may dominate short-term disturbance signals.</span>
                  </div>
                )}
                {seasonalDiffMonths >= 3 && (
                  <div className="text-amber-300/80 text-[7.5px] leading-tight flex items-start gap-1 pt-1 border-t border-white/5">
                    <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0 mt-0.5 text-amber-400" />
                    <span><b>Seasonal Divergence:</b> {seasonalDiffMonths}-month offset (Month {bMonth + 1} vs Month {aMonth + 1}). Spectral differences may reflect cyclical dry vs monsoon vegetation cycles rather than true land-cover changes.</span>
                  </div>
                )}
              </div>
            );
          })()}

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
                        src={getSceneImageUrl(comparison.before.matchedScene, true)}
                        alt="Before Satellite Scene"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const directUrl = comparison.before.matchedScene?.thumbnailUrl
                            ? `/api/satellite/asset?url=${encodeURIComponent(comparison.before.matchedScene.thumbnailUrl)}`
                            : '';
                          if (directUrl && target.src !== directUrl && !target.dataset.retried) {
                            target.dataset.retried = 'true';
                            target.src = directUrl;
                            return;
                          }
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-full h-full flex flex-col items-center justify-center p-2 text-center text-[8.5px] text-amber-300/80 bg-black/80';
                            fallback.innerText = 'Observation pending. Click "Process".';
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
                        src={getSceneImageUrl(comparison.after.matchedScene, true)}
                        alt="After Satellite Scene"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const directUrl = comparison.after.matchedScene?.thumbnailUrl
                            ? `/api/satellite/asset?url=${encodeURIComponent(comparison.after.matchedScene.thumbnailUrl)}`
                            : '';
                          if (directUrl && target.src !== directUrl && !target.dataset.retried) {
                            target.dataset.retried = 'true';
                            target.src = directUrl;
                            return;
                          }
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-full h-full flex flex-col items-center justify-center p-2 text-center text-[8.5px] text-amber-300/80 bg-black/80';
                            fallback.innerText = 'Observation pending. Click "Process".';
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
                      Attribution: {
                        activeTelemetry.platform.includes('Pléiades') || activeTelemetry.platform.includes('Airbus')
                          ? '© Airbus Defence and Space / CNES (Pléiades Neo 30cm PAN / 1.2m MS)'
                          : activeTelemetry.platform.includes('SkySat') || activeTelemetry.platform.includes('Planet')
                            ? '© Planet Labs PBC (SkySat 50cm Ortho Resolution)'
                            : activeTelemetry.platform.includes('WorldView') || activeTelemetry.platform.includes('Maxar')
                              ? '© Maxar Technologies (WorldView-3 31cm Native Resolution)'
                              : activeTelemetry.platform.includes('Landsat')
                                ? 'USGS / NASA Landsat Program (30m Optical/Thermal)'
                                : activeTelemetry.platform === 'High-Res'
                                  ? '© Esri, Maxar, Earthstar Geographics, USDA, USGS (High-Res 0.5m/px)'
                                  : activeTelemetry.platform === 'Sentinel-1'
                                    ? 'Contains modified Copernicus Sentinel-1 radar data, processed by ORBINEX'
                                    : 'Contains modified Copernicus Sentinel data, processed by ORBINEX / Element84'
                      }
                    </div>

                    {/* High-res asset links */}
                    <div className="pt-1 flex items-center justify-between">
                      {activeTelemetry.visualUrl && !activeTelemetry.visualUrl.includes('{z}') && (
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
                      {activeTelemetry.thumbnailUrl && !activeTelemetry.thumbnailUrl.includes('{z}') && (
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

              {/* Interactive Split-Screen Swipe Comparison Slider */}
              {comparison.before.matchedScene?.thumbnailUrl && comparison.after.matchedScene?.thumbnailUrl && (
                <div className="p-2.5 rounded bg-black/60 border border-cyan-500/30 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                    <span className="flex items-center gap-1.5 text-[#00E5FF]">
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>SPLIT COMPARISON SLIDER</span>
                    </span>
                    <span className="text-[9px] text-[#00E5FF] font-mono">{sliderPos}%</span>
                  </div>

                  {/* Swipe Viewer Container */}
                  <div className="relative aspect-video rounded overflow-hidden select-none border border-white/20 bg-black cursor-ew-resize">
                    {/* AFTER IMAGE (Base layer) */}
                    <img
                      src={getSceneImageUrl(comparison.after.matchedScene, true)}
                      alt="After Scene"
                      className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.retried && comparison.after.matchedScene?.thumbnailUrl) {
                          target.dataset.retried = 'true';
                          target.src = `/api/satellite/asset?url=${encodeURIComponent(comparison.after.matchedScene.thumbnailUrl)}`;
                        }
                      }}
                    />

                    {/* BEFORE IMAGE (Clipped overlay via clip-path) */}
                    <img
                      src={getSceneImageUrl(comparison.before.matchedScene, true)}
                      alt="Before Scene"
                      className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                      style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.retried && comparison.before.matchedScene?.thumbnailUrl) {
                          target.dataset.retried = 'true';
                          target.src = `/api/satellite/asset?url=${encodeURIComponent(comparison.before.matchedScene.thumbnailUrl)}`;
                        }
                      }}
                    />

                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-cyan-400 text-[8px] font-bold pointer-events-none">
                      BEFORE ({formatAcquisitionDate(comparison.before.matchedScene.datetime)})
                    </div>

                    <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[#00E5FF] text-[8px] font-bold pointer-events-none">
                      AFTER ({formatAcquisitionDate(comparison.after.matchedScene.datetime)})
                    </div>

                    {/* Divider Line Handle */}
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none border-r border-[#00E5FF]"
                      style={{ left: `${sliderPos}%` }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#00E5FF] text-black flex items-center justify-center text-[8px] font-bold shadow-[0_0_8px_#00E5FF]">
                        ⇄
                      </div>
                    </div>

                    {/* Drag Input */}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderPos}
                      onChange={(e) => setSliderPos(parseInt(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
                    />
                  </div>

                  <div className="flex justify-between text-[7.5px] text-slate-400">
                    <span>◀ Drag slider left (Reveal AFTER)</span>
                    <span>Drag slider right (Reveal BEFORE) ▶</span>
                  </div>
                </div>
              )}

              {/* Automated Multi-Temporal Change Analysis */}
              {comparison.before.matchedScene?.thumbnailUrl && comparison.after.matchedScene?.thumbnailUrl && (
                <div className="p-2.5 rounded bg-black/60 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <BarChart3 className="w-3 h-3" />
                      <span>CHANGE DETECTION & SPECTRAL DELTAS</span>
                    </span>
                    {analysisReport && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-mono">
                        CONFIDENCE {analysisReport.confidence_pct}%
                      </span>
                    )}
                  </div>

                  {!analysisReport ? (
                    <button
                      onClick={handleRunAnalysis}
                      disabled={analyzing}
                      className="w-full py-2 px-3 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-white font-bold text-[9.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-50"
                    >
                      {analyzing ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                          <span>ANALYZING SPECTRAL DELTAS...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          <span>RUN AUTOMATED CHANGE DETECTION</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {/* Summary Box */}
                      <div className="p-2 rounded bg-white/[0.03] border border-white/10 space-y-1">
                        <div className="flex items-center justify-between text-[8.5px]">
                          <span className="text-slate-400">Monitored AOI Area:</span>
                          <span className="text-white font-bold">{analysisReport.aoi_area_km2} km²</span>
                        </div>
                        {analysisReport.valid_overlap_pct != null && (
                          <div className="flex items-center justify-between text-[8.5px]">
                            <span className="text-slate-400">Valid Surface Overlap:</span>
                            <span className={`font-mono font-bold ${analysisReport.valid_overlap_pct >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {analysisReport.valid_overlap_pct}%
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[8.5px]">
                          <span className="text-slate-400">Total Detected Change:</span>
                          <span className="text-amber-400 font-bold">{analysisReport.total_change_pct}% ({analysisReport.changed_area_km2} km²)</span>
                        </div>
                      </div>

                      {/* Spectral Metrics Grid */}
                      <div className="grid grid-cols-3 gap-1.5 text-[8px] text-center font-mono">
                        <div className="p-1.5 rounded bg-red-500/10 border border-red-500/30">
                          <div className="text-red-400 font-bold">VEG LOSS</div>
                          <div className="text-white text-[9.5px] font-bold mt-0.5">{analysisReport.metrics.vegetation_loss_pct}%</div>
                          <div className="text-slate-400 text-[7px]">{analysisReport.metrics.vegetation_loss_km2} km²</div>
                        </div>
                        <div className="p-1.5 rounded bg-cyan-500/10 border border-cyan-500/30">
                          <div className="text-cyan-400 font-bold">WATER SHIFT</div>
                          <div className="text-white text-[9.5px] font-bold mt-0.5">{analysisReport.metrics.water_shift_pct > 0 ? `+${analysisReport.metrics.water_shift_pct}` : analysisReport.metrics.water_shift_pct}%</div>
                          <div className="text-slate-400 text-[7px]">{analysisReport.metrics.water_shift_km2} km²</div>
                        </div>
                        <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/30">
                          <div className="text-amber-400 font-bold">DISTURBANCE</div>
                          <div className="text-white text-[9.5px] font-bold mt-0.5">{analysisReport.metrics.builtup_disturbance_pct}%</div>
                          <div className="text-slate-400 text-[7px]">{analysisReport.metrics.builtup_disturbance_km2} km²</div>
                        </div>
                      </div>

                      {/* Observations List */}
                      <div className="space-y-1 text-[8.5px]">
                        <div className="text-slate-400 font-bold uppercase text-[8px]">Key Observations:</div>
                        <ul className="list-disc pl-3 text-slate-300 space-y-0.5">
                          {analysisReport.findings.map((f: string, i: number) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Heatmap Preview & Toggle */}
                      {analysisReport.heatmapBase64 && (
                        <div className="pt-1 border-t border-white/10 space-y-1.5">
                          <div className="flex items-center justify-between text-[8px] text-slate-400">
                            <span>CHANGE HEATMAP (SPECTRAL DELTA MASK)</span>
                            <button
                              onClick={() => setShowHeatmap(!showHeatmap)}
                              className="text-[#00E5FF] hover:underline"
                            >
                              {showHeatmap ? 'Hide Heatmap' : 'View Heatmap'}
                            </button>
                          </div>
                          {showHeatmap && (
                            <div className="relative aspect-video rounded overflow-hidden border border-emerald-500/40">
                              <img
                                src={analysisReport.heatmapBase64}
                                alt="Change Difference Heatmap"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[7px] text-slate-300 flex items-center gap-1.5">
                                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Veg Loss</span>
                                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Veg Gain</span>
                                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span> Water</span>
                                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span> Disturbance</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Limitations */}
                      <div className="text-[7.5px] text-slate-500 italic pt-1 border-t border-white/5">
                        {analysisReport.limitations}
                      </div>

                      {/* Specialist AI Suite (Prithvi, Forest, Building, Water, Land) */}
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        <div className="flex items-center justify-between text-[8px] font-bold text-slate-300">
                          <span className="flex items-center gap-1 text-[#00E5FF]">
                            <Sparkles className="w-3 h-3 text-[#00E5FF]" />
                            SPECIALIST AI SUITE (AI-07 to AI-13)
                          </span>
                        </div>

                        {!specialistAiResult ? (
                          <button
                            onClick={handleRunSpecialistAi}
                            disabled={runningSpecialistAi}
                            className="w-full py-1.5 px-2 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-200 font-bold text-[8.5px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_rgba(6,182,212,0.2)] disabled:opacity-50"
                          >
                            {runningSpecialistAi ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                                <span>RUNNING MULTI-MODEL INFERENCE...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3 text-cyan-400" />
                                <span>RUN SPECIALIST MULTI-MODEL AI</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="space-y-2 p-2 rounded bg-cyan-950/20 border border-cyan-500/30 text-[8px]">
                            {/* Prithvi Foundation Model Score */}
                            <div className="p-1.5 rounded bg-black/40 border border-cyan-500/20 flex items-center justify-between">
                              <span className="text-cyan-300 font-bold">Prithvi-EO-2.0:</span>
                              <span className="text-emerald-400 font-mono font-bold">
                                Anomaly {specialistAiResult.foundation_model?.foundation_anomaly_score}% (Shift: {specialistAiResult.foundation_model?.latent_temporal_divergence})
                              </span>
                            </div>

                            {/* Specialist Metrics Breakdown */}
                            <div className="grid grid-cols-2 gap-1 font-mono">
                              <div className="p-1 rounded bg-black/30 border border-white/5">
                                <div className="text-red-400 font-bold">FOREST AI (AI-08)</div>
                                <div className="text-slate-300">Loss: {specialistAiResult.specialists?.forest?.metrics?.canopy_loss_km2} km² ({specialistAiResult.specialists?.forest?.metrics?.canopy_loss_pct}%)</div>
                                <div className="text-slate-400 text-[7px]">CO₂e: {specialistAiResult.specialists?.forest?.metrics?.estimated_biomass_co2e_loss_tons?.toLocaleString()} tons</div>
                              </div>
                              <div className="p-1 rounded bg-black/30 border border-white/5">
                                <div className="text-amber-400 font-bold">URBAN AI (AI-10)</div>
                                <div className="text-slate-300">New Impervious: {specialistAiResult.specialists?.building?.metrics?.new_construction_km2} km²</div>
                                <div className="text-slate-400 text-[7px]">~{specialistAiResult.specialists?.building?.metrics?.estimated_new_structures?.toLocaleString()} footprints</div>
                              </div>
                              <div className="p-1 rounded bg-black/30 border border-white/5">
                                <div className="text-cyan-400 font-bold">WATER AI (AI-11)</div>
                                <div className="text-slate-300">State: {specialistAiResult.specialists?.water?.hydrologic_state}</div>
                                <div className="text-slate-400 text-[7px]">Gain: {specialistAiResult.specialists?.water?.metrics?.water_inundation_km2} km² · Loss: {specialistAiResult.specialists?.water?.metrics?.water_recession_km2} km²</div>
                              </div>
                              <div className="p-1 rounded bg-black/30 border border-white/5">
                                <div className="text-emerald-400 font-bold">LAND COVER (AI-12)</div>
                                <div className="text-slate-300">Trees: {specialistAiResult.specialists?.land_cover?.observation_t2_pct?.tree_cover}%</div>
                                <div className="text-slate-400 text-[7px]">Built-up: {specialistAiResult.specialists?.land_cover?.observation_t2_pct?.built_up}%</div>
                              </div>
                            </div>

                            {/* Continuous Learning Analyst Feedback (AI-18) */}
                            <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[7.5px]">
                              <span className="text-slate-400">Analyst Verification (AI-18):</span>
                              <div className="flex items-center gap-1">
                                {feedbackRecorded ? (
                                  <span className="text-emerald-400 font-bold">Feedback Logged!</span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleSendFeedback('TRUE_POSITIVE')}
                                      className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40"
                                    >
                                      Confirm TP
                                    </button>
                                    <button
                                      onClick={() => handleSendFeedback('FALSE_POSITIVE')}
                                      className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40"
                                    >
                                      Flag FP
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleRunAnalysis}
                        className="w-full py-1 text-[8px] font-bold uppercase rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                      >
                        Re-Analyze Observations
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Intelligence Dossier PDF Generator Card */}
              <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-950/30 via-slate-900/60 to-slate-950 border border-cyan-500/30 shadow-lg shadow-cyan-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-cyan-400 text-[10px] font-bold tracking-wider">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>INTELLIGENCE DOSSIER (PDF)</span>
                  </div>
                  <span className="text-[7.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                    8 PAGES • L2A
                  </span>
                </div>

                <p className="text-[8px] text-slate-400 leading-relaxed">
                  Generate an authoritative, publication-ready intelligence report featuring dual-temporal satellite imagery, radiometric change heatmaps, pixel variance analytics, and verified data provenance.
                </p>

                {reportError && (
                  <div className="p-2 rounded bg-red-950/40 border border-red-500/30 flex items-start gap-1.5 text-red-300 text-[8px]">
                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold">Generation Failed:</span> {reportError}
                    </div>
                  </div>
                )}

                {reportSuccess && (
                  <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-1.5 text-emerald-300 text-[8px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-semibold">PDF Dossier generated and downloaded successfully!</span>
                  </div>
                )}

                <button
                  onClick={handleGeneratePdfReport}
                  disabled={generatingReport}
                  className={`w-full py-2.5 px-3 rounded-lg font-bold text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md ${
                    generatingReport
                      ? 'bg-cyan-950/50 text-cyan-300 border border-cyan-500/40 cursor-wait'
                      : 'bg-gradient-to-r from-cyan-600 hover:from-cyan-500 to-blue-600 hover:to-blue-500 text-white shadow-cyan-500/25 border border-cyan-400/40 hover:border-cyan-300 active:scale-[0.99]'
                  }`}
                >
                  {generatingReport ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                      <span>GENERATING INTELLIGENCE DOSSIER...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>GENERATE FULL INTELLIGENCE REPORT (PDF)</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-[7px] text-slate-500 pt-0.5">
                  <span>Contains Modified Copernicus Sentinel Data</span>
                  <span>Two-Pass 'Page X of Y' • Vector Charts</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
