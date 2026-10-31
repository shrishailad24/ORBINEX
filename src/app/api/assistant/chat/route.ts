import { NextRequest, NextResponse } from 'next/server';
import { buildGroundedContext, type AssistantContext } from '@/lib/assistant-rag';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], context } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Valid prompt message is required.' },
        { status: 400 }
      );
    }

    // 1. Build Grounded RAG Context
    const { contextBlock, sources } = await buildGroundedContext(message, context as AssistantContext);

    // 2. Formulate System Prompt
    const systemPrompt = `You are ORBINEX AI — a friendly, minimal, intelligent assistant built exclusively for this website (ORBINEX: Global Earth Observation & Geospatial Intelligence Platform).

## CORE OPERATIONAL RULES (CHATGPT STYLE):
1. MINIMAL & USER-FRIENDLY: Speak naturally, warmly, and clearly like ChatGPT. Keep answers brief (typically 2-3 short sentences or 2-3 crisp bullet points). Avoid wall-of-text answers, robotic preambles, and repetitive disclaimers.
2. STRICTLY ABOUT THIS WEBSITE: You only help with ORBINEX features and Earth observation:
   - Comparing BEFORE vs AFTER satellite imagery (Copernicus Sentinel-2 Optical and Sentinel-1 SAR Radar)
   - Drawing an Area of Interest (AOI) anywhere on the globe to detect surface changes (vegetation/forest loss, water shifts, ground disturbance)
   - Generating publication-grade PDF Satellite Intelligence Reports
   - Viewing live global feeds: CCTV traffic cameras, live flights (ADS-B), ship tracking (AIS), earthquake alerts, wildfires, and weather
   - Navigating to locations worldwide (including small towns, colleges, and rural plots)
   *If the user asks about unrelated topics (e.g., general coding, cooking, movies, politics, or unrelated chit-chat), politely decline in one short friendly sentence explaining that you are exclusively dedicated to ORBINEX planetary intelligence, and invite them to explore map or satellite data.*
3. SATELLITE & MAP AWARE: If an active AOI or map coordinates are present in the context, reference them naturally (e.g., "For your selected area over Western Ghats...").
4. CLEAN FORMATTING: Use clean markdown with bold highlights and concise bullet points. No unnecessary fluff.

=== RETRIEVED ORBINEX DATA CONTEXT ===
${contextBlock}
======================================`;

    // 3. Assemble Chat Messages
    const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Append recent history (up to last 6 messages)
    if (Array.isArray(history)) {
      const recent = history.slice(-6);
      for (const msg of recent) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          formattedMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    formattedMessages.push({ role: 'user', content: message });

    // 4. Query Groq API
    let answer = '';
    const modelsToTry = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama3-70b-8192',
      'mixtral-8x7b-32768',
    ];

    for (const model of modelsToTry) {
      try {
        const groqRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            temperature: 0.3,
            max_tokens: 512,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          answer = data.choices?.[0]?.message?.content || '';
          if (answer) break;
        } else {
          console.warn(`[ORBINEX-AI] Model ${model} returned HTTP ${groqRes.status}`);
        }
      } catch (err: any) {
        console.warn(`[ORBINEX-AI] Failed model ${model}:`, err.message);
      }
    }

    if (!answer) {
      // Graceful fallback if upstream quota or network issue
      answer = `**I'm connected to ORBINEX planetary telemetry.**\n\n- **Target Area:** ${context?.activeAOI?.name || 'Global View'}\n- **Satellite Constellations:** Sentinel-1 SAR & Sentinel-2 Optical active.\n\nHow can I help you? You can draw a box on the map to analyze surface changes or generate a full PDF report.`;
    }

    return NextResponse.json({
      answer,
      sources,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ORBINEX-AI] Assistant endpoint error:', err);
    return NextResponse.json(
      { error: 'Internal assistant error', details: err.message },
      { status: 500 }
    );
  }
}
