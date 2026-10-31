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
  ShieldAlert
} from 'lucide-react';
import type { AssistantContext, RAGSource } from '@/lib/assistant-rag';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: RAGSource[];
  timestamp: string;
}

interface GlobalAssistantBarProps {
  activeAOI?: any | null;
  viewState?: { lat: number; lng: number; zoom: number } | null;
  onLocate?: (lat: number, lng: number, zoom?: number) => void;
  onOpenSatellite?: () => void;
}

export default function GlobalAssistantBar({
  activeAOI,
  viewState,
  onLocate,
  onOpenSatellite,
}: GlobalAssistantBarProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Speech Recognition
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
          console.warn('[ORBINEX-AI] Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!speechSupported) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Speech start error:', err);
      }
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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

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
  }, [input, loading, isListening, activeAOI, viewState, messages, ttsEnabled]);

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
            className="mb-3 max-h-[380px] bg-[#070D18]/95 backdrop-blur-2xl border border-[#00E5FF]/40 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9),0_0_25px_rgba(0,229,255,0.2)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span className="text-[11px] font-bold text-white tracking-widest uppercase">
                  PLANETARY INTELLIGENCE DOSSIER
                </span>
                {activeAOI && (
                  <span className="px-1.5 py-0.5 rounded bg-[#00E5FF]/20 text-[#00E5FF] text-[8.5px] font-mono border border-[#00E5FF]/40 truncate max-w-[200px]">
                    AOI: {activeAOI.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMessages([])}
                  className="text-[9px] text-slate-400 hover:text-white transition-colors"
                >
                  Clear History
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white transition-colors"
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
                  <div className="flex items-center gap-1.5 text-[8.5px] text-slate-400 font-mono">
                    {m.role === 'user' ? (
                      <>
                        <span>OPERATOR</span>
                        <User className="w-2.5 h-2.5 text-slate-400" />
                      </>
                    ) : (
                      <>
                        <Bot className="w-2.5 h-2.5 text-[#00E5FF]" />
                        <span className="text-[#00E5FF] font-bold">ORBINEX AI</span>
                      </>
                    )}
                    <span>• {m.timestamp}</span>
                  </div>

                  <div
                    className={`p-3 rounded-xl max-w-[90%] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#00E5FF]/20 border border-[#00E5FF]/40 text-white rounded-br-none shadow-[0_0_12px_rgba(0,229,255,0.15)]'
                        : 'bg-black/60 border border-white/10 text-slate-100 rounded-bl-none prose prose-invert prose-xs max-w-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-[11.5px]">{m.content}</div>

                    {/* Grounded RAG Sources Drawer */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1">
                        <div className="flex items-center gap-1 text-[8.5px] text-slate-400 uppercase tracking-wider font-semibold">
                          <Database className="w-2.5 h-2.5 text-[#00E5FF]" />
                          <span>Grounded Evidence & Telemetry Sources:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {m.sources.map((s, idx) => (
                            <span
                              key={idx}
                              title={s.details}
                              className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-[8px] text-[#00E5FF]/90 font-mono flex items-center gap-1"
                            >
                              <span>{s.name}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 p-3 bg-black/60 border border-[#00E5FF]/30 rounded-xl text-slate-300 text-[11px] animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00E5FF]" />
                  <span>Cross-referencing satellite observations, seismic feeds, and live telemetry...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Action Suggested Chips */}
            <div className="px-4 py-2 border-t border-white/10 bg-white/[0.01] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <span className="text-[8.5px] text-slate-500 uppercase tracking-wider shrink-0">Prompts:</span>
              <button
                onClick={() => handleSendMessage('Analyse this active area for vegetation and land cover change.')}
                className="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/20 border border-white/10 hover:border-[#00E5FF]/50 text-[9px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                🛰️ Analyse Active AOI
              </button>
              <button
                onClick={() => handleSendMessage('Explain the active earthquake alerts in the last 24 hours.')}
                className="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/20 border border-white/10 hover:border-[#00E5FF]/50 text-[9px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                🌋 Global Earthquakes
              </button>
              <button
                onClick={() => handleSendMessage('What is the operational status of the Copernicus Sentinel pipeline?')}
                className="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/20 border border-white/10 hover:border-[#00E5FF]/50 text-[9px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                📡 Sentinel Pipeline Status
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimal Capsule Assistant Bar (Exact Match with Reference Design) */}
      <div className="relative flex items-center gap-3 bg-[#070D18]/90 backdrop-blur-2xl border border-[#00E5FF]/40 hover:border-[#00E5FF]/70 focus-within:border-[#00E5FF] rounded-full px-4 py-2 shadow-[0_0_35px_rgba(0,0,0,0.85),0_0_20px_rgba(0,229,255,0.18)] transition-all">
        {/* Sparkle icon */}
        <Sparkles className="w-4 h-4 text-[#00E5FF] shrink-0 animate-pulse" />

        {/* Text Input */}
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
          className="w-full bg-transparent text-white text-[12.5px] font-mono placeholder:text-slate-500 focus:outline-none tracking-wide"
        />

        {/* View Previous Response Indicator Badge (if minimized) */}
        {messages.length > 0 && !isExpanded && (
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
          title={isListening ? 'Stop listening' : 'Speak using microphone'}
          className={`p-1.5 rounded-full transition-all shrink-0 ${
            isListening
              ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-bounce'
              : 'text-slate-400 hover:text-[#00E5FF] hover:bg-white/5'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>

        {/* Circular Send Button */}
        <button
          onClick={() => handleSendMessage()}
          disabled={!input.trim() || loading}
          title="Send query"
          className="w-7 h-7 rounded-full bg-[#00E5FF]/10 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/40 hover:border-[#00E5FF] flex items-center justify-center text-[#00E5FF] hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-[#00E5FF]/10 disabled:hover:border-[#00E5FF]/40 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
