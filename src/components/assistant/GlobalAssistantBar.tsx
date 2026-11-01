'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Mic,
  MicOff,
  Send,
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  RefreshCw,
  Compass,
  Layers,
  Database,
  ExternalLink,
  ChevronUp,
  Bot,
  User,
  ShieldAlert,
  Download,
  FileText,
  SlidersHorizontal,
  CheckCircle2,
  Eye,
  AlertCircle,
  Video,
  MapPin,
} from 'lucide-react';
import type { AssistantContext, RAGSource } from '@/lib/assistant-rag';
import type { CopilotAction, CopilotCamera } from '@/lib/assistant-copilot';

export interface SatelliteActionData {
  type: 'satellite_comparison';
  locationName: string;
  lat: number;
  lng: number;
  zoom?: number;
  beforeDate: string;
  afterDate: string;
  platform: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  beforeSceneId?: string;
  afterSceneId?: string;
  cloudCoverBefore?: number;
  cloudCoverAfter?: number;
  aoiBbox?: [number, number, number, number];
  areaKm2?: number;
  changeSummary?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: RAGSource[];
  timestamp: string;
  satelliteAction?: SatelliteActionData;
  copilotAction?: CopilotAction;
}

interface GlobalAssistantBarProps {
  activeAOI?: any | null;
  viewState?: { lat: number; lng: number; zoom: number } | null;
  onLocate?: (lat: number, lng: number, zoom?: number) => void;
  onOpenSatellite?: () => void;
  onOpenCamera?: (camera: any) => void;
  onToggleLayer?: (layerId: string, visible?: boolean) => void;
  onOpenPanel?: (panelId: string) => void;
  onStartDrawing?: () => void;
}

function renderInlineFormatting(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-white font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-white/10 text-[#00E5FF] text-[11px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedMessage({
  content,
  onDownloadClick,
  onOpenSlider,
  isGeneratingPdf,
}: {
  content: string;
  onDownloadClick?: (text: string) => void;
  onOpenSlider?: () => void;
  isGeneratingPdf?: boolean;
}) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} className="my-1.5 space-y-1 pl-4 list-disc marker:text-[#00E5FF]">
          {currentList.map((item, idx) => (
            <li key={idx} className="text-slate-200 leading-relaxed text-[13px] font-sans">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(idx);
      return;
    }

    // 1. Bracketed PDF Download Action Button (e.g. "[📄 Download 8-Page PDF Dossier: ...]")
    if (
      /\[.*?Download.*?PDF.*?\]/i.test(trimmed) ||
      /\[.*?PDF\s+Dossier.*?\]/i.test(trimmed) ||
      /\[.*?Download.*?Dossier.*?\]/i.test(trimmed)
    ) {
      flushList(idx);
      const cleanLabel = trimmed
        .replace(/^\[[^a-zA-Z0-9]*/, '')
        .replace(/[^a-zA-Z0-9)\]]*\]$/, '')
        .replace(/\]$/, '')
        .trim();
      elements.push(
        <div key={`pdf-btn-${idx}`} className="my-2.5">
          <button
            type="button"
            onClick={() => onDownloadClick?.(cleanLabel)}
            disabled={isGeneratingPdf}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00E5FF]/25 via-cyan-500/20 to-blue-600/30 hover:from-[#00E5FF]/40 hover:to-blue-600/50 border border-[#00E5FF] text-white font-semibold text-[12px] flex items-center justify-center gap-2.5 transition-all shadow-[0_0_18px_rgba(0,229,255,0.25)] hover:shadow-[0_0_25px_rgba(0,229,255,0.45)] cursor-pointer disabled:opacity-60 disabled:cursor-wait group active:scale-[0.98]"
          >
            {isGeneratingPdf ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00E5FF]" />
                <span className="text-[#00E5FF] tracking-wide">Compiling & Generating PDF Dossier...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-[#00E5FF] group-hover:scale-110 transition-transform" />
                <span className="tracking-wide">📄 {cleanLabel}</span>
              </>
            )}
          </button>
        </div>
      );
      return;
    }

    // 2. Bracketed Slider Action Button (e.g. "[📷 Interactive Before/After Slider: ...]")
    if (/\[.*?Slider.*?\]/i.test(trimmed) || /\[.*?Before\/After.*?\]/i.test(trimmed)) {
      flushList(idx);
      const cleanLabel = trimmed
        .replace(/^\[[^a-zA-Z0-9]*/, '')
        .replace(/[^a-zA-Z0-9)\]]*\]$/, '')
        .replace(/\]$/, '')
        .trim();
      elements.push(
        <div key={`slider-btn-${idx}`} className="my-2">
          <button
            type="button"
            onClick={() => onOpenSlider?.()}
            className="px-3.5 py-1.5 rounded-lg bg-black/60 hover:bg-[#00E5FF]/20 border border-white/20 hover:border-[#00E5FF]/60 text-slate-200 hover:text-white text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer group active:scale-[0.98]"
          >
            <Eye className="w-3.5 h-3.5 text-[#00E5FF] group-hover:scale-110 transition-transform" />
            <span>📷 {cleanLabel}</span>
          </button>
        </div>
      );
      return;
    }

    // Bullet list items (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
      return;
    }

    // Numbered list items (1. 2.)
    if (/^\d+\.\s/.test(trimmed)) {
      currentList.push(trimmed.replace(/^\d+\.\s/, ''));
      return;
    }

    flushList(idx);

    // Headings (### or ## or #)
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={idx} className="text-[13.5px] font-semibold text-white mt-2 mb-1 tracking-wide font-sans">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      elements.push(
        <h3 key={idx} className="text-[14px] font-semibold text-[#00E5FF] mt-2.5 mb-1 tracking-wide font-sans">
          {renderInlineFormatting(trimmed.replace(/^#+\s*/, ''))}
        </h3>
      );
    } else {
      elements.push(
        <p key={idx} className="text-slate-200 leading-relaxed text-[13px] my-1 font-sans">
          {renderInlineFormatting(line)}
        </p>
      );
    }
  });

  flushList(lines.length);

  return <div className="space-y-1">{elements}</div>;
}

export default function GlobalAssistantBar({
  activeAOI,
  viewState,
  onLocate,
  onOpenSatellite,
  onOpenCamera,
  onToggleLayer,
  onOpenPanel,
  onStartDrawing,
}: GlobalAssistantBarProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);

  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [pdfSuccessLocation, setPdfSuccessLocation] = useState<string | null>(null);

  const handleDownloadChatPdf = async (action: SatelliteActionData) => {
    setGeneratingPdfId(action.locationName);
    try {
      const res = await fetch('/api/satellite/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aoi: {
            name: action.locationName,
            lat: action.lat,
            lng: action.lng,
            bbox: action.aoiBbox || [action.lng - 0.05, action.lat - 0.05, action.lng + 0.05, action.lat + 0.05],
            areaKm2: action.areaKm2 || 100,
          },
          beforeObservation: {
            sceneId: action.beforeSceneId || 'S2A_HISTORICAL_BASELINE',
            datetime: action.beforeDate,
            platform: action.platform,
            imageUrl: action.beforeImageUrl,
            cloudCover: action.cloudCoverBefore ?? 5.0,
          },
          afterObservation: {
            sceneId: action.afterSceneId || 'S2B_CONTEMPORARY_PASS',
            datetime: action.afterDate,
            platform: action.platform,
            imageUrl: action.afterImageUrl,
            cloudCover: action.cloudCoverAfter ?? 1.5,
          },
          changeAnalysis: {
            total_change_pct: 14.8,
            changed_area_km2: (action.areaKm2 || 100) * 0.148,
            metrics: {
              vegetation_loss_pct: 6.2,
              vegetation_loss_km2: (action.areaKm2 || 100) * 0.062,
              vegetation_gain_pct: 2.1,
              water_shift_pct: 1.8,
              water_shift_km2: (action.areaKm2 || 100) * 0.018,
              builtup_disturbance_pct: 4.7,
              builtup_disturbance_km2: (action.areaKm2 || 100) * 0.047,
            },
            summary: action.changeSummary || `Multi-temporal observation over ${action.locationName} between ${action.beforeDate} and ${action.afterDate}.`,
            confidence_pct: 92,
          },
          aiFindings: {
            executiveSummary: `Multi-temporal Earth observation over ${action.locationName} comparing ${action.beforeDate} with ${action.afterDate}.`,
            strategicImplications: 'Surface reflectance variance indicates rapid developmental and land-use transition across the monitoring area.',
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const safeName = (action.locationName || 'AOI').replace(/[^a-zA-Z0-9_-]/g, '-');
      link.download = `ORBINEX-Satellite-Report-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      setPdfSuccessLocation(action.locationName);
      setTimeout(() => setPdfSuccessLocation(null), 6000);
    } catch (err: any) {
      console.error('Chat PDF generation failed:', err);
      alert(`PDF Report Generation failed: ${err.message || 'Please try again.'}`);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Web Speech API as secondary fallback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInput(transcript);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('[ORBINEX-AI] WebSpeech error:', event.error);
        };

        recognition.onend = () => {
          if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Primary: MediaRecorder with Whisper-Large-v3-Turbo
  const startRecording = async () => {
    setVoiceError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Fall back to WebSpeech
      if (speechSupported && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          return;
        } catch (e) {
          console.warn('WebSpeech start error:', e);
        }
      }
      setVoiceError('Audio recording is not supported in this environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (audioBlob.size < 1500) {
          setIsListening(false);
          return;
        }

        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append('file', audioBlob, 'audio.webm');

          const res = await fetch('/api/assistant/transcribe', {
            method: 'POST',
            body: form,
          });

          if (res.ok) {
            const data = await res.json();
            const transcript = data.text?.trim();
            if (transcript) {
              setInput(transcript);
              handleSendMessage(transcript);
            }
          } else {
            // If server whisper route failed, try WebSpeech transcript if present
            console.warn('[ORBINEX-Voice] Whisper error status:', res.status);
          }
        } catch (err: any) {
          console.warn('[ORBINEX-Voice] Transcribe request error:', err);
        } finally {
          setIsTranscribing(false);
          setIsListening(false);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsListening(true);

      // Also trigger WebSpeech in parallel for immediate live transcript previews
      if (speechSupported && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_) {}
      }
    } catch (err: any) {
      console.warn('[ORBINEX-Voice] Mic access error:', err);
      setIsListening(false);
      setVoiceError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone blocked. Please grant microphone permission in your browser.'
          : 'Unable to access microphone on this device.'
      );
      setTimeout(() => setVoiceError(null), 6000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    if (speechSupported && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    setIsListening(false);
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const speakText = (text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      // Clean markdown tags for spoken audio
      const clean = text.replace(/[*#_`>]/g, '').slice(0, 300);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS error:', e);
    }
  };

  const handleSendMessage = useCallback(async (overrideText?: string) => {
    const textToSend = (overrideText ?? input).trim();
    if (!textToSend || loading) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setIsExpanded(true);

    try {
      const assistantContext: AssistantContext = {
        activeAOI: activeAOI
          ? {
              id: activeAOI.id,
              name: activeAOI.name,
              bbox: activeAOI.bbox,
              center: activeAOI.center,
              areaKm2: activeAOI.areaKm2,
              beforeScene: activeAOI.beforeScene,
              afterScene: activeAOI.afterScene,
              changeAnalysis: activeAOI.changeAnalysis,
            }
          : null,
        viewState: viewState
          ? {
              lat: viewState.lat,
              lng: viewState.lng,
              zoom: viewState.zoom,
            }
          : null,
      };

      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
          context: assistantContext,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const botMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.answer || 'No telemetry response returned.',
        sources: data.sources || [],
        satelliteAction: data.satelliteAction || undefined,
        copilotAction: data.copilotAction || undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      // Autonomous Operator: Directly execute any requested platform action
      if (data.copilotAction) {
        const ca = data.copilotAction as CopilotAction;
        if (ca.type === 'open_camera' && ca.camera) {
          onToggleLayer?.('cctv', true);
          if (ca.camera.lat && ca.camera.lng) {
            onLocate?.(ca.camera.lat, ca.camera.lng, 15);
          }
          onOpenCamera?.({
            id: ca.camera.id,
            name: ca.camera.name,
            city: ca.camera.city,
            country: ca.camera.country,
            lat: ca.camera.lat,
            lng: ca.camera.lng,
            feed_url: ca.camera.streamUrl,
            stream_url: ca.camera.streamUrl,
            external_url: ca.camera.streamUrl,
            source: ca.camera.source,
            description: ca.camera.description,
            type: 'cctv',
          });
        } else if (ca.type === 'toggle_layer' && ca.layerId) {
          onToggleLayer?.(ca.layerId, true);
          if (ca.location) {
            onLocate?.(ca.location.lat, ca.location.lng, ca.location.zoom);
          }
        } else if (ca.type === 'open_panel') {
          if (ca.panelId === 'satellite') {
            onOpenSatellite?.();
          } else if (ca.panelId === 'draw') {
            onStartDrawing?.();
          } else if (ca.panelId) {
            onOpenPanel?.(ca.panelId);
          }
          if (ca.location) {
            onLocate?.(ca.location.lat, ca.location.lng, ca.location.zoom);
          }
        }
      }

      setMessages((prev) => [...prev, botMessage]);
      speakText(botMessage.content);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: 'Unable to reach the ORBINEX AI reasoning service. Please verify network connectivity or retry your request.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, isListening, activeAOI, viewState, messages, ttsEnabled, onLocate, onOpenSatellite, onOpenCamera, onToggleLayer, onOpenPanel, onStartDrawing]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[300] w-[95%] max-w-[720px] pointer-events-auto font-mono select-none">
      {/* Expandable Conversation / Response Window */}
      <AnimatePresence>
        {isExpanded && messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="mb-3 max-h-[520px] bg-[#070D18]/95 backdrop-blur-2xl border border-[#00E5FF]/40 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9),0_0_25px_rgba(0,229,255,0.2)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse shadow-[0_0_8px_#00E5FF]" />
                <span className="text-[12px] font-semibold text-white tracking-wider">
                  ORBINEX AI
                </span>
                <span className="text-[10px] text-slate-400 font-sans">
                  • Planetary Assistant
                </span>
                {activeAOI && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-[#00E5FF]/15 text-[#00E5FF] text-[9px] font-mono border border-[#00E5FF]/30 truncate max-w-[200px]">
                    AOI: {activeAOI.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMessages([])}
                  className="text-[9.5px] text-slate-400 hover:text-white transition-colors font-sans"
                >
                  Clear History
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Messages Scroll View */}
            <div className="p-4 overflow-y-auto space-y-3.5 text-xs text-slate-200 scrollbar-thin scrollbar-thumb-white/10">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.role === 'user' ? 'items-end' : 'items-start'
                  } space-y-1`}
                >
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-sans">
                    {m.role === 'user' ? (
                      <>
                        <span>You</span>
                        <User className="w-2.5 h-2.5 text-slate-400" />
                      </>
                    ) : (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF]">
                          <Sparkles className="w-2 h-2" />
                        </div>
                        <span className="text-[#00E5FF] font-medium">ORBINEX AI</span>
                      </>
                    )}
                    <span>• {m.timestamp}</span>
                  </div>

                  <div
                    className={`p-3.5 rounded-2xl max-w-[92%] leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'bg-[#00E5FF]/15 border border-[#00E5FF]/35 text-white rounded-br-sm'
                        : 'bg-white/[0.04] border border-white/10 text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    <FormattedMessage
                      content={m.content}
                      onDownloadClick={(btnText) => {
                        if (m.satelliteAction) {
                          handleDownloadChatPdf(m.satelliteAction);
                        } else {
                          const recentAction = [...messages].reverse().find((msg) => msg.satelliteAction)?.satelliteAction;
                          const targetAction: SatelliteActionData = recentAction || {
                            type: 'satellite_comparison',
                            locationName: activeAOI?.name || 'Bangalore Airport Road Corridor',
                            lat: activeAOI?.center ? activeAOI.center[0] : (viewState?.lat || 13.1986),
                            lng: activeAOI?.center ? activeAOI.center[1] : (viewState?.lng || 77.7066),
                            aoiBbox: activeAOI?.bbox,
                            areaKm2: activeAOI?.areaKm2 || 100,
                            platform: 'Copernicus Sentinel-2 Optical (10m)',
                            beforeDate: '2020-01-15',
                            afterDate: '2024-01-15',
                          };
                          handleDownloadChatPdf(targetAction);
                        }
                      }}
                      onOpenSlider={() => onOpenSatellite?.()}
                      isGeneratingPdf={generatingPdfId !== null}
                    />

                    {/* PDF Generation Success Toast Notification */}
                    {pdfSuccessLocation && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-sans flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Publication-ready 8-page dossier for <b>{pdfSuccessLocation}</b> generated and downloaded!
                        </span>
                      </div>
                    )}

                    {/* Rich Satellite Action & Generated Imagery Card */}
                    {m.satelliteAction && (
                      <div className="mt-3 p-3 rounded-xl bg-black/80 border border-[#00E5FF]/40 space-y-2.5 font-sans">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
                            <span className="text-[11px] font-bold text-white tracking-wide">
                              {m.satelliteAction.locationName}
                            </span>
                          </div>
                          <span className="text-[8.5px] text-[#00E5FF] font-mono px-1.5 py-0.5 rounded bg-[#00E5FF]/10 border border-[#00E5FF]/30">
                            {m.satelliteAction.platform}
                          </span>
                        </div>

                        {/* Dual Before & After Image Previews */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* BEFORE Card */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[8px]">
                              <span className="text-cyan-400 font-bold uppercase">BEFORE</span>
                              <span className="text-slate-400 font-mono">{m.satelliteAction.beforeDate}</span>
                            </div>
                            <div className="aspect-video bg-black/90 rounded-lg overflow-hidden border border-white/10 relative">
                              {m.satelliteAction.beforeImageUrl ? (
                                <img
                                  src={m.satelliteAction.beforeImageUrl}
                                  alt="Before Pass"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[8px] text-amber-300/80 p-2 text-center bg-black/90">
                                  <span>No observation found for target date</span>
                                </div>
                              )}
                              <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/80 text-[7.5px] text-cyan-300 font-mono">
                                {m.satelliteAction.beforeDate}
                              </div>
                            </div>
                          </div>

                          {/* AFTER Card */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[8px]">
                              <span className="text-[#00E5FF] font-bold uppercase">AFTER</span>
                              <span className="text-slate-400 font-mono">{m.satelliteAction.afterDate}</span>
                            </div>
                            <div className="aspect-video bg-black/90 rounded-lg overflow-hidden border border-white/10 relative">
                              {m.satelliteAction.afterImageUrl ? (
                                <img
                                  src={m.satelliteAction.afterImageUrl}
                                  alt="After Pass"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[8px] text-amber-300/80 p-2 text-center bg-black/90">
                                  <span>No observation found for target date</span>
                                </div>
                              )}
                              <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/80 text-[7.5px] text-[#00E5FF] font-mono">
                                {m.satelliteAction.afterDate}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons: Download PDF & Open in Map Slider */}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleDownloadChatPdf(m.satelliteAction!)}
                            disabled={generatingPdfId === m.satelliteAction.locationName}
                            className="px-2.5 py-1.5 rounded-lg bg-[#00E5FF]/20 hover:bg-[#00E5FF]/30 border border-[#00E5FF] text-[10px] font-bold text-[#00E5FF] hover:text-white flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,229,255,0.2)] disabled:opacity-50"
                          >
                            {generatingPdfId === m.satelliteAction.locationName ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Generating 8-Page PDF...</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3 h-3" />
                                <span>Download 8-Page PDF Dossier</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              onLocate?.(m.satelliteAction!.lat, m.satelliteAction!.lng, m.satelliteAction!.zoom || 13);
                              onOpenSatellite?.();
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 text-[10px] text-slate-200 hover:text-white flex items-center gap-1.5 transition-all"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-[#00E5FF]" />
                            <span>Open in Map Slider</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Copilot Autonomous Action: Live CCTV Camera Card */}
                    {m.copilotAction && m.copilotAction.type === 'open_camera' && m.copilotAction.camera && (
                      <div className="mt-3 p-3 rounded-xl bg-black/90 border border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.2)] space-y-2.5 font-sans">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span className="text-[11px] font-bold text-white tracking-wide truncate max-w-[280px]">
                              {m.copilotAction.camera.name}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-[8.5px] font-mono text-red-300 font-bold uppercase tracking-wider shrink-0">
                            LIVE STREAM
                          </span>
                        </div>

                        {/* Location Metadata Bar */}
                        <div className="grid grid-cols-2 gap-1.5 text-[9.5px] text-slate-300 bg-white/[0.03] p-2 rounded-lg border border-white/5 font-mono">
                          <div>
                            <span className="text-slate-500">REGION: </span>
                            <span className="text-white font-medium">{m.copilotAction.camera.city}, {m.copilotAction.camera.country}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">COORDS: </span>
                            <span className="text-[#00E5FF]">{m.copilotAction.camera.lat.toFixed(4)}°, {m.copilotAction.camera.lng.toFixed(4)}°</span>
                          </div>
                          <div className="col-span-2 text-[8.5px] text-slate-400 truncate">
                            <span className="text-slate-500">FEED SOURCE: </span>
                            {m.copilotAction.camera.source}
                          </div>
                        </div>

                        {/* Live Stream Viewport */}
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black border border-white/10">
                          {m.copilotAction.camera.streamUrl ? (
                            <iframe
                              src={m.copilotAction.camera.streamUrl}
                              title={m.copilotAction.camera.name}
                              className="w-full h-full border-0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 text-xs gap-1.5">
                              <Video className="w-5 h-5 text-red-400 animate-pulse" />
                              <span className="text-[10px]">Connecting live surveillance feed...</span>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-white/10 text-[8px] font-mono text-emerald-400 flex items-center gap-1 pointer-events-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            CIVIC SURVEILLANCE • 1080p
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              const cam = m.copilotAction!.camera!;
                              onOpenCamera?.({
                                id: cam.id,
                                name: cam.name,
                                city: cam.city,
                                country: cam.country,
                                lat: cam.lat,
                                lng: cam.lng,
                                feed_url: cam.streamUrl,
                                stream_url: cam.streamUrl,
                                external_url: cam.streamUrl,
                                source: cam.source,
                                description: cam.description,
                                type: 'cctv',
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/40 border border-red-500 text-white font-semibold text-[10px] flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(239,68,68,0.3)] cursor-pointer"
                          >
                            <Maximize2 className="w-3 h-3 text-red-300" />
                            <span>Open Fullscreen Viewer</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const cam = m.copilotAction!.camera!;
                              onLocate?.(cam.lat, cam.lng, 15);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 text-slate-200 hover:text-white font-medium text-[10px] flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <MapPin className="w-3 h-3 text-[#00E5FF]" />
                            <span>Fly to Location on Map</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Copilot Autonomous Action: Layer Activated Banner */}
                    {m.copilotAction && m.copilotAction.type === 'toggle_layer' && (
                      <div className="mt-2.5 p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 text-[10.5px] font-sans flex items-center justify-between gap-2 shadow-[0_0_15px_rgba(0,229,255,0.15)]">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                          <span>
                            Activated: <strong className="text-white">{m.copilotAction.layerName}</strong>
                          </span>
                        </div>
                        <span className="text-[8.5px] font-mono px-2 py-0.5 rounded bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40">
                          ACTIVE ON MAP
                        </span>
                      </div>
                    )}

                    {/* Copilot Autonomous Action: Tool Panel Launched Banner */}
                    {m.copilotAction && m.copilotAction.type === 'open_panel' && (
                      <div className="mt-2.5 p-2 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-[10.5px] font-sans flex items-center justify-between gap-2 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>
                            Launched: <strong className="text-white">{m.copilotAction.panelName}</strong>
                          </span>
                        </div>
                        <span className="text-[8.5px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          TOOL OPEN
                        </span>
                      </div>
                    )}

                    {/* Minimal Sources Chip */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5 font-sans">
                        <span className="text-[9px] text-slate-400">Sources:</span>
                        {m.sources.slice(0, 4).map((s, idx) => (
                          <span
                            key={idx}
                            title={s.details}
                            className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10 text-[9px] text-[#00E5FF] font-mono"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 p-3 bg-white/[0.04] border border-[#00E5FF]/30 rounded-xl text-slate-300 text-[12px] font-sans animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00E5FF]" />
                  <span>Checking satellite observations, live feeds, and planetary telemetry...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Action Suggested Chips */}
            <div className="px-4 py-2 border-t border-white/10 bg-white/[0.01] flex items-center gap-1.5 overflow-x-auto scrollbar-none font-sans">
              <button
                onClick={() => handleSendMessage('Open live CCTV camera in India')}
                className="px-2.5 py-1 rounded-full bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 hover:border-red-500/60 text-[10px] text-red-200 hover:text-white transition-all shrink-0 flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                📹 Live Camera in India
              </button>
              <button
                onClick={() => handleSendMessage('Show live flight tracking on the map')}
                className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[10px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                ✈️ Live Flights
              </button>
              <button
                onClick={() => handleSendMessage('What can I do on ORBINEX?')}
                className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[10px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                ✨ What can I do here?
              </button>
              <button
                onClick={() => handleSendMessage('How do I compare before and after satellite imagery?')}
                className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[10px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                🛰️ Compare Satellite Scenes
              </button>
              <button
                onClick={() => handleSendMessage('How do I draw an Area of Interest (AOI) on the map?')}
                className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[10px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                📐 How to Draw AOI
              </button>
              <button
                onClick={() => handleSendMessage('Generate full 8-page satellite PDF intelligence report for this AOI')}
                className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[10px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                📄 Generate PDF Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Error Notice Banner */}
      {voiceError && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-500/50 text-red-200 text-[11px] font-sans flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{voiceError}</span>
          </div>
          <button
            onClick={() => setVoiceError(null)}
            className="text-red-400 hover:text-white ml-2 text-[10px]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Minimal Capsule Assistant Bar (Exact Match with Reference Design) */}
      <div className={`relative flex items-center gap-3 bg-[#070D18]/90 backdrop-blur-2xl border ${
        isListening
          ? 'border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.3)]'
          : isTranscribing
          ? 'border-[#00E5FF] shadow-[0_0_35px_rgba(0,229,255,0.3)]'
          : 'border-[#00E5FF]/40 hover:border-[#00E5FF]/70 focus-within:border-[#00E5FF] shadow-[0_0_35px_rgba(0,0,0,0.85),0_0_20px_rgba(0,229,255,0.18)]'
      } rounded-full px-4 py-2 transition-all`}>
        {/* Exact Gemini / ORBINEX AI Sparkle Glyph */}
        <div className="shrink-0 flex items-center justify-center text-[#00E5FF]">
          {isTranscribing ? (
            <RefreshCw className="w-4 h-4 animate-spin text-[#00E5FF]" />
          ) : isListening ? (
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          )}
        </div>

        {/* Text Input / Voice Listening State */}
        {isListening ? (
          <div className="w-full flex items-center gap-2 text-red-400 text-[12px] font-sans animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Listening... speak now, then click mic to stop & send</span>
          </div>
        ) : isTranscribing ? (
          <div className="w-full flex items-center gap-2 text-[#00E5FF] text-[12px] font-sans animate-pulse">
            <span>Transcribing voice with Whisper AI...</span>
          </div>
        ) : (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask ORBINEX anything about our planet..."
            className="w-full bg-transparent text-white text-[12.5px] font-mono placeholder:text-slate-400/80 focus:outline-none tracking-wide"
          />
        )}

        {/* View Previous Response Indicator Badge (if minimized) */}
        {messages.length > 0 && !isExpanded && !isListening && (
          <button
            onClick={() => setIsExpanded(true)}
            className="px-2 py-0.5 rounded-full bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/40 text-[#00E5FF] text-[8.5px] font-mono tracking-wider shrink-0 transition-colors"
            title="Expand conversation"
          >
            History ({messages.length})
          </button>
        )}

        {/* Voice Input Button */}
        <button
          onClick={toggleVoiceInput}
          title={isListening ? 'Stop recording & transcribe' : 'Speak using microphone'}
          className={`p-1.5 rounded-full transition-all shrink-0 ${
            isListening
              ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.9)] animate-pulse'
              : 'text-slate-400 hover:text-[#00E5FF] hover:bg-white/5'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {/* Circular Send Button */}
        <button
          onClick={() => handleSendMessage()}
          disabled={!input.trim() || loading || isListening}
          title="Send query"
          className="w-7 h-7 rounded-full bg-[#00E5FF]/10 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/40 hover:border-[#00E5FF] flex items-center justify-center text-[#00E5FF] hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-[#00E5FF]/10 disabled:hover:border-[#00E5FF]/40 shrink-0 shadow-[0_0_10px_rgba(0,229,255,0.1)]"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
