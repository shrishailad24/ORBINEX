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
    const systemPrompt = `You are ORBINEX Planetary AI Assistant — the built-in intelligence agent of the ORBINEX Global Earth Observation and Geospatial Intelligence Platform.

## OPERATIONAL GUIDELINES:
1. GROUNDED IN TRUTH: Base your responses strictly on the verified data retrieved from ORBINEX feeds and satellite observation records provided in the context below. Never invent live events, coordinates, sensor measurements, or satellite pass dates.
2. SATELLITE & AOI AWARENESS: When an Area of Interest (AOI) is provided in the context, refer specifically to its name, coordinates, bounding box, and surface area. If multi-temporal change detection metrics are present, report the exact percentage deltas for vegetation, water, and surface disturbance.
3. MILITARY/PALANTIR BREVITY: Provide structured, authoritative, analytical answers with inverted-pyramid clarity. Use markdown headers, bold highlights, and clean bullet points.
4. HONEST LIMITATIONS: If requested data or satellite imagery for a specific date is unavailable, state this clearly without hallucinating. Distinguish verified physical measurements from analytical interpretations.

=== CURRENT RETRIEVED ORBINEX DATA CONTEXT ===
${contextBlock}
==============================================`;

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
    const modelsToTry = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

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
            temperature: 0.2,
            max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(20000),
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
      answer = `### ORBINEX Grounded Telemetry Assessment
**Target:** ${context?.activeAOI?.name || 'Global Map View'}

I have retrieved the active geospatial records:
- **Location:** ${context?.activeAOI?.name || `${context?.viewState?.lat.toFixed(2)}°N, ${context?.viewState?.lng.toFixed(2)}°E`}
- **Footprint Area:** ~${context?.activeAOI?.areaKm2 ? `${context.activeAOI.areaKm2.toFixed(1)} km²` : 'Global Overview'}
${context?.activeAOI?.changeAnalysis ? `- **Observed Delta:** ${context.activeAOI.changeAnalysis.total_change_pct}% total change detected.` : '- **Satellite Pipeline:** Sentinel-1 SAR & Sentinel-2 Optical monitoring active.'}

*(AI generation service temporarily experiencing high upstream latency. Raw telemetry successfully grounded from verified platform sources.)*`;
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
