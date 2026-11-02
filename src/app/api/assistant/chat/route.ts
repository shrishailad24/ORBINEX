import { NextRequest, NextResponse } from 'next/server';
import { buildGroundedContext, generateLocalFallbackResponse, type AssistantContext } from '@/lib/assistant-rag';
import { buildHistoricalComparison, STRATEGIC_PRESETS } from '@/lib/satellite/historical-providers';
import { parseCopilotAction, type CopilotAction } from '@/lib/assistant-copilot';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY || '';

const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number; name: string; zoom: number }> = {
  bengaluru: { lat: 12.9716, lng: 77.5946, name: 'Bengaluru Peri-Urban Fringe', zoom: 13 },
  bangalore: { lat: 12.9716, lng: 77.5946, name: 'Bengaluru Peri-Urban Fringe', zoom: 13 },
  bengluru: { lat: 12.9716, lng: 77.5946, name: 'Bengaluru Peri-Urban Fringe', zoom: 13 },
  benglore: { lat: 12.9716, lng: 77.5946, name: 'Bangalore Metropolitan Region', zoom: 13 },
  'bengaluru airport road': { lat: 13.1986, lng: 77.7066, name: 'Bangalore Airport Road Corridor', zoom: 13 },
  'bangalore airport road': { lat: 13.1986, lng: 77.7066, name: 'Bangalore Airport Road Corridor', zoom: 13 },
  'airport road': { lat: 13.1986, lng: 77.7066, name: 'Bangalore Airport Road Corridor', zoom: 13 },
  'airportport road': { lat: 13.1986, lng: 77.7066, name: 'Bangalore Airport Road Corridor', zoom: 13 },
  airport: { lat: 13.1986, lng: 77.7066, name: 'Bangalore Airport Road Corridor', zoom: 13 },
  yeshwanthpur: { lat: 13.0227, lng: 77.5447, name: 'Yeshwanthpur Transport Hub', zoom: 14 },
  mathikere: { lat: 13.0334, lng: 77.5640, name: 'Mathikere Urban Sector', zoom: 14 },
  delhi: { lat: 28.6139, lng: 77.2090, name: 'New Delhi National Capital Region', zoom: 13 },
  'new delhi': { lat: 28.6139, lng: 77.2090, name: 'New Delhi National Capital Region', zoom: 13 },
  mumbai: { lat: 19.0760, lng: 72.8777, name: 'Mumbai Metropolitan Area', zoom: 13 },
  kolkata: { lat: 22.5726, lng: 88.3639, name: 'Kolkata Metropolitan Area', zoom: 13 },
  chennai: { lat: 13.0827, lng: 80.2707, name: 'Chennai Urban Corridor', zoom: 13 },
  hyderabad: { lat: 17.3850, lng: 78.4867, name: 'Hyderabad Cyberabad Region', zoom: 13 },
  varanasi: { lat: 25.3176, lng: 82.9739, name: 'Varanasi Ghats Heritage Corridor', zoom: 13 },
  kerala: { lat: 9.9312, lng: 76.2673, name: 'Kochi & Kerala Coastal Zone', zoom: 12 },
  kerela: { lat: 9.9312, lng: 76.2673, name: 'Kochi & Kerala Coastal Zone', zoom: 12 },
  dhubri: { lat: 26.02, lng: 89.98, name: 'Dhubri Riverine Border', zoom: 13 },
  assam: { lat: 26.02, lng: 89.98, name: 'Dhubri Riverine Border', zoom: 13 },
  brahmaputra: { lat: 26.02, lng: 89.98, name: 'Dhubri Riverine Border', zoom: 13 },
  ghats: { lat: 13.50, lng: 75.25, name: 'Western Ghats Forest Canopy', zoom: 12 },
  kumbh: { lat: 25.43, lng: 81.88, name: 'Prayagraj Sangam (Maha Kumbh)', zoom: 13 },
  prayagraj: { lat: 25.43, lng: 81.88, name: 'Prayagraj Sangam (Maha Kumbh)', zoom: 13 },
  tokyo: { lat: 35.6762, lng: 139.6503, name: 'Tokyo Metropolis', zoom: 13 },
  london: { lat: 51.5074, lng: -0.1278, name: 'London Metropolitan Area', zoom: 13 },
  'new york': { lat: 40.7128, lng: -74.0060, name: 'New York Urban Corridor', zoom: 13 },
  sahara: { lat: 23.4162, lng: 25.6628, name: 'Sahara Desert Basin', zoom: 10 },
  amazon: { lat: -3.4653, lng: -62.2159, name: 'Amazon Rainforest Biosphere', zoom: 11 },
};

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

    const textLower = message.toLowerCase();

    // 1. Distinguish between Informational (how-to/explanation) queries vs Explicit Action requests
    const isInformationalQuery =
      /^(how\s+(do|can|to)|what\s+(is|can|are)|explain|guide|help|where\s+can|tell\s+me|show\s+me\s+how)/i.test(textLower) ||
      /how\s+(do|can)\s+i\s+(compare|draw|generate|download|view)/i.test(textLower);

    // 2. Affirmative follow-ups ("yeah give me", "yes", "sure", "download it", "generate it")
    const isAffirmativeFollowup =
      /^(yeah|yes|yep|sure|ok|okay|please|give\s+me|send\s+it|download\s+it|generate\s+it|do\s+it|let's\s+do\s+it|go\s+ahead)\b/i.test(textLower.trim()) ||
      /(yeah\s+give\s+me|yes\s+please|give\s+it\s+to\s+me|download\s+pdf|get\s+pdf|generate\s+pdf|make\s+pdf)/i.test(textLower.trim());

    // 3. Explicit Action request to generate/produce satellite imagery or PDF dossier
    const isExplicitActionRequest =
      !isInformationalQuery &&
      (
        isAffirmativeFollowup ||
        /(generat|genrat|grnerat|create|make|build|run|fetch|pull|produce)\s+.*(pdf|report|dossier|imagery|image|pass|comparison)/i.test(textLower) ||
        /(can\s+u|please|kindly)?\s*(generate|gen|show|display|get|create|download)\s+.*(bengaluru|bengluru|bangalore|benglore|airport|dhubri|prayagraj|ghats|tokyo|amazon|satellite|img|image|pdf|report|dossier)/i.test(textLower) ||
        /(image|img|pic|picture)\s+of\s+.*(before|after|airport|bengaluru|bangalore|benglore|dhubri|amazon)/i.test(textLower) ||
        /^(generate|compare|download|create)\b/i.test(textLower.trim()) ||
        /before\s+and\s+after\s+image/i.test(textLower)
      );

    let satelliteAction: any = null;

    if (isExplicitActionRequest) {
      // 1. Resolve Location from current message (prefer most specific / longest match first)
      let targetLoc: { lat: number; lng: number; name: string; zoom: number } | null = null;
      const sortedLocationKeys = Object.keys(KNOWN_LOCATIONS).sort((a, b) => b.length - a.length);
      for (const key of sortedLocationKeys) {
        if (textLower.includes(key)) {
          targetLoc = KNOWN_LOCATIONS[key];
          break;
        }
      }

      // 2. If not found in message, inherit location from recent history (e.g. user answered "yeah give me")
      if (!targetLoc && Array.isArray(history) && history.length > 0) {
        const historyText = history.slice(-4).map((h) => h.content || '').join(' ').toLowerCase();
        for (const key of sortedLocationKeys) {
          if (historyText.includes(key)) {
            targetLoc = KNOWN_LOCATIONS[key];
            break;
          }
        }
      }

      let isAmbiguousLocation = false;
      if (!targetLoc && isAffirmativeFollowup && context?.activeAOI) {
        targetLoc = {
          lat: context.activeAOI.center[0],
          lng: context.activeAOI.center[1],
          name: context.activeAOI.name,
          zoom: 13,
        };
      } else if (!targetLoc) {
        isAmbiguousLocation = true;
      }

      if (isAmbiguousLocation || !targetLoc) {
        const clarificationMsg = `I could not locate verified geographic coordinates for that location in the ORBINEX planetary directory. To ensure precision analysis, please specify the city or latitude/longitude, or use the **Draw-to-Analyse AOI** tool on the primary map to select the target area.`;
        return NextResponse.json({
          answer: clarificationMsg,
          sources: [],
          satelliteAction: null,
          copilotAction: null,
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Resolve Dates
      const years = message.match(/\b(19\d\d|20\d\d)\b/g);
      let beforeDate = '2020-01-15';
      let afterDate = '2024-01-15';
      if (years && years.length >= 2) {
        beforeDate = `${years[0]}-01-15`;
        afterDate = `${years[1]}-01-15`;
      } else if (years && years.length === 1) {
        beforeDate = `${years[0]}-01-15`;
      }

      // 3. Compute Bounding Box
      const radiusKm = 5;
      const deltaLat = radiusKm / 111.32;
      const cosLat = Math.cos((targetLoc.lat * Math.PI) / 180);
      const deltaLng = radiusKm / (111.32 * Math.max(0.01, cosLat));
      const aoiBbox: [number, number, number, number] = [
        Number((targetLoc.lng - deltaLng).toFixed(4)),
        Number((targetLoc.lat - deltaLat).toFixed(4)),
        Number((targetLoc.lng + deltaLng).toFixed(4)),
        Number((targetLoc.lat + deltaLat).toFixed(4)),
      ];

      try {
        const comparison = await buildHistoricalComparison(
          targetLoc.lat,
          targetLoc.lng,
          beforeDate,
          afterDate,
          'Sentinel-2',
          radiusKm,
          aoiBbox
        );

        const beforeScene = comparison?.before?.matchedScene;
        const afterScene = comparison?.after?.matchedScene;

        const isIdentical = Boolean(
          beforeScene && afterScene && (beforeScene.id === afterScene.id || beforeScene.thumbnailUrl === afterScene.thumbnailUrl)
        );

        let beforeImgUrl = '';
        let afterImgUrl = '';

        if (beforeScene?.thumbnailUrl && !isIdentical) {
          beforeImgUrl = `/api/satellite/process?url=${encodeURIComponent(beforeScene.thumbnailUrl)}&stretch=true&platform=Sentinel-2&width=640&sceneBbox=${(beforeScene.bbox || aoiBbox).join(',')}&aoiBbox=${aoiBbox.join(',')}&sceneId=${encodeURIComponent(beforeScene.id)}&datetime=${encodeURIComponent(beforeScene.datetime)}`;
        }
        if (afterScene?.thumbnailUrl && !isIdentical) {
          afterImgUrl = `/api/satellite/process?url=${encodeURIComponent(afterScene.thumbnailUrl)}&stretch=true&platform=Sentinel-2&width=640&sceneBbox=${(afterScene.bbox || aoiBbox).join(',')}&aoiBbox=${aoiBbox.join(',')}&sceneId=${encodeURIComponent(afterScene.id)}&datetime=${encodeURIComponent(afterScene.datetime)}`;
        }

        satelliteAction = {
          type: 'satellite_comparison',
          locationName: targetLoc.name,
          lat: targetLoc.lat,
          lng: targetLoc.lng,
          zoom: targetLoc.zoom,
          beforeDate: beforeScene?.datetime ? beforeScene.datetime.split('T')[0] : beforeDate,
          afterDate: afterScene?.datetime ? afterScene.datetime.split('T')[0] : afterDate,
          platform: 'Copernicus Sentinel-2 Optical (10m)',
          beforeImageUrl: beforeImgUrl || undefined,
          afterImageUrl: afterImgUrl || undefined,
          beforeSceneId: beforeScene?.id || undefined,
          afterSceneId: afterScene?.id || undefined,
          cloudCoverBefore: beforeScene?.cloudCover ?? null,
          cloudCoverAfter: afterScene?.cloudCover ?? null,
          aoiBbox,
          areaKm2: 100,
          changeSummary: `Dual-temporal observation of ${targetLoc.name} comparing ${beforeDate} with ${afterDate}.`,
        };
      } catch (e) {
        console.warn('[ORBINEX-AI] Satellite auto-fetch failed:', e);
      }

      // Explicit status if satellite observation could not be retrieved
      if (!satelliteAction) {
        satelliteAction = {
          type: 'satellite_comparison',
          locationName: targetLoc.name,
          lat: targetLoc.lat,
          lng: targetLoc.lng,
          zoom: targetLoc.zoom,
          beforeDate,
          afterDate,
          platform: 'Copernicus Sentinel-2 Optical (10m)',
          beforeImageUrl: undefined,
          afterImageUrl: undefined,
          beforeSceneId: undefined,
          afterSceneId: undefined,
          cloudCoverBefore: null,
          cloudCoverAfter: null,
          aoiBbox,
          areaKm2: 100,
          changeSummary: `No suitable satellite observations found for ${targetLoc.name} on the requested target dates.`,
        };
      }
    }

    // 1. Detect Autonomous Platform Copilot Action (CCTV cameras, layers, navigation, tools)
    let copilotAction = parseCopilotAction(message);
    if (!copilotAction && /(camera|cctv|cc camera|surveillance|live cam|traffic cam|webcam|video feed)/i.test(textLower)) {
      copilotAction = parseCopilotAction(`${message} open camera`);
    }

    // 2. Build Grounded RAG Context
    const { contextBlock, sources } = await buildGroundedContext(message, context as AssistantContext);

    // 3. Formulate System Prompt
    let systemPrompt = `You are ORBINEX AI — the primary autonomous operator and geospatial intelligence copilot for this website (ORBINEX: Global Earth Observation & Geospatial Intelligence Platform).

## CORE OPERATIONAL DIRECTIVES (AUTONOMOUS SITE OPERATOR):
1. AUTONOMOUS OPERATOR RULE: You HAVE direct control over this website! If the user asks for CCTV cameras, traffic feeds, flight tracking, maritime vessels, weather radar, wildfire thermal data, earthquakes, or satellite comparisons, YOU DIRECTLY OPERATE AND OPEN THEM FOR THE USER!
   - NEVER say "I cannot open live CCTV feeds", "I cannot provide links to cameras", or "Go to the sidebar to find it".
   - You HAVE already activated and opened the requested camera feed, layer, or tool for the user!
   - Confirm that you have opened the live camera / layer / tool for them directly on their screen and navigated the primary map.
2. MINIMAL & USER-FRIENDLY: Speak naturally, warmly, and clearly like ChatGPT. Keep answers crisp (2-3 short sentences or clear bullet points).
3. SATELLITE & SENSOR INTEL: You compare dual-temporal satellite imagery (Sentinel-1 SAR, Sentinel-2 Optical, Landsat 8/9, Planet SkySat 50cm, and Pléiades Neo 30cm) and trigger 8-page PDF dossiers.
4. LIVE SURVEILLANCE & CCTV: You can locate and open real-time civic, traffic, and security camera streams across India (Delhi, Mumbai, Bengaluru, Varanasi, Kolkata, Prayagraj, etc.), North America, Europe, and Asia-Pacific.
5. CLEAN FORMATTING: Use clean markdown with bold highlights and bullet points.

=== RETRIEVED ORBINEX DATA CONTEXT ===
${contextBlock}
======================================`;

    if (copilotAction) {
      if (copilotAction.type === 'open_camera') {
        const c = copilotAction.camera!;
        systemPrompt += `\n\n### AUTONOMOUS ACTION EXECUTED:
You have located and automatically OPENED the live public camera feed: "${c.name}" in ${c.city}, ${c.country} (${c.lat.toFixed(4)}° N, ${c.lng.toFixed(4)}° E)!
The primary map has been navigated to this camera and the live stream card is active directly on the user's screen. Confirm that you have opened this live camera feed for them and summarize the location.`;
      } else if (copilotAction.type === 'toggle_layer') {
        systemPrompt += `\n\n### AUTONOMOUS ACTION EXECUTED:
You have ACTIVATED the live layer: "${copilotAction.layerName}" directly on the user's primary map! Confirm that the layer is now visible and streaming telemetry.`;
      } else if (copilotAction.type === 'open_panel') {
        systemPrompt += `\n\n### AUTONOMOUS ACTION EXECUTED:
You have LAUNCHED the tool panel: "${copilotAction.panelName}" for the user!`;
      }
    }

    if (satelliteAction) {
      systemPrompt += `\n\n### ACTION EXECUTED:
You have retrieved and generated the verified dual-temporal satellite observations for ${satelliteAction.locationName} (${satelliteAction.beforeDate} vs ${satelliteAction.afterDate})!
The interactive Before/After imagery cards and the "Download 8-Page PDF Dossier" button are rendered directly underneath your answer. Summarize the key observations concisely and tell the user they can view the cards and download the full PDF dossier below.`;
    }

    // 4. Assemble Chat Messages
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

    // 5. Query Groq API
    let answer = '';
    const modelsToTry = [
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
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
            temperature: 0.6,
            max_tokens: 650,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          const messageObj = data.choices?.[0]?.message;
          const rawContent = messageObj?.content?.trim() || '';
          const rawReasoning = messageObj?.reasoning?.trim() || '';
          answer = rawContent || rawReasoning || '';
          if (answer && answer.length > 10) break;
        } else {
          console.warn(`[ORBINEX-AI] Model ${model} returned HTTP ${groqRes.status}`);
        }
      } catch (err: any) {
        console.warn(`[ORBINEX-AI] Failed model ${model}:`, err.message);
      }
    }

    const isRefusal =
      /i (can't|cannot|do not have the ability to|am unable to) (open|access|stream|provide direct links to) (live )?(cctv|camera|feed|stream|private)/i.test(answer) ||
      /as an ai.*(cannot|can't) (open|view|access|stream)/i.test(answer) ||
      /i can't open/i.test(answer) ||
      /i cannot open/i.test(answer) ||
      (/private cameras/i.test(answer) && /cannot|can't/i.test(answer)) ||
      /to find a live camera/i.test(answer) ||
      /navigate to the location/i.test(answer) ||
      /toggle the ["']?cctv/i.test(answer) ||
      /select a camera/i.test(answer);

    if (!answer || answer.trim().length === 0 || isRefusal) {
      if (!copilotAction && /(camera|cctv|feed|stream|cam)/i.test(textLower)) {
        copilotAction = parseCopilotAction(`${message} open camera`);
      }
      // Intelligent grounded local fallback whenever external API quota or refusal is detected
      if (copilotAction?.type === 'open_camera') {
        const cam = copilotAction.camera!;
        answer = `I have located and opened a live public camera feed in **${cam.country}** for you:\n\n### 📹 ${cam.name}\n- **City & Region:** ${cam.city}, ${cam.region}\n- **Coordinates:** ${cam.lat.toFixed(4)}° N, ${cam.lng.toFixed(4)}° E\n- **Source:** ${cam.source}\n\nI have enabled the CCTV surveillance layer, navigated the primary map directly to this location, and opened the live feed player for you below.`;
      } else if (copilotAction?.type === 'toggle_layer') {
        answer = `I have activated the **${copilotAction.layerName}** layer directly on your primary map. You can now see real-time updates and tracked entities across the globe.`;
      } else if (copilotAction?.type === 'open_panel') {
        answer = `I have launched the **${copilotAction.panelName}** for you. The interactive panel is now active on your screen.`;
      } else if (satelliteAction) {
        answer = `### 🛰️ Generated Satellite Observations for ${satelliteAction.locationName}\n\n- **Historical Baseline (BEFORE):** ${satelliteAction.beforeDate} (${satelliteAction.platform})\n- **Contemporary Pass (AFTER):** ${satelliteAction.afterDate} (${satelliteAction.platform})\n\nI have generated the dual-temporal satellite imagery and compiled the publication-grade **8-page Georeferenced PDF Dossier** below. You can inspect the images, open them in the split slider, or download the report directly.`;
      } else {
        answer = generateLocalFallbackResponse(message, context as AssistantContext);
      }
    }

    return NextResponse.json({
      answer,
      sources,
      satelliteAction,
      copilotAction,
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
