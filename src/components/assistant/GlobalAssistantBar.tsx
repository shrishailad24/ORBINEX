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

function FormattedMessage({ content }: { content: string }) {
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
                    <FormattedMessage content={m.content} />

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
                onClick={() => handleSendMessage('How do I generate and download a satellite PDF intelligence report?')}
                className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-[#00E5FF]/15 border border-white/10 hover:border-[#00E5FF]/40 text-[10px] text-slate-300 hover:text-white transition-all shrink-0"
              >
                📄 Generate PDF Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimal Capsule Assistant Bar (Exact Match with Reference Design) */}
      <div className="relative flex items-center gap-3 bg-[#070D18]/90 backdrop-blur-2xl border border-[#00E5FF]/40 hover:border-[#00E5FF]/70 focus-within:border-[#00E5FF] rounded-full px-4 py-2 shadow-[0_0_35px_rgba(0,0,0,0.85),0_0_20px_rgba(0,229,255,0.18)] transition-all">
        {/* Exact Gemini / ORBINEX AI Sparkle Glyph */}
        <div className="shrink-0 flex items-center justify-center text-[#00E5FF]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </div>

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
          className="w-full bg-transparent text-white text-[12.5px] font-mono placeholder:text-slate-400/80 focus:outline-none tracking-wide"
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
          className="w-7 h-7 rounded-full bg-[#00E5FF]/10 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/40 hover:border-[#00E5FF] flex items-center justify-center text-[#00E5FF] hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-[#00E5FF]/10 disabled:hover:border-[#00E5FF]/40 shrink-0 shadow-[0_0_10px_rgba(0,229,255,0.1)]"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
