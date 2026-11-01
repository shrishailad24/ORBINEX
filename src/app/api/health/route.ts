import { NextResponse } from 'next/server';
import { nominatimStats } from '@/lib/nominatim';
import { planetaryEventBus } from '@/lib/satellite/streaming';

/**
 * ORBINEX — Process Liveness & Planetary Telemetry
 */
export async function GET() {
  return NextResponse.json({
    status: 'serving',
    scope: 'process',
    platform: 'ORBINEX',
    tagline: 'See the World. Understand the Change.',
    version: '2.0.0-verified',
    uptime_seconds: process.uptime ? Math.round(process.uptime()) : null,
    memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    nominatim: nominatimStats(),
    event_bus: planetaryEventBus.getStats(),
    subsystems: {
      open_satellite_engine: 'operational',
      commercial_vhr_engine: 'operational',
      specialist_ai_engine: 'operational',
      pdf_report_generator: 'operational',
      rag_assistant_engine: 'operational',
    },
    timestamp: new Date().toISOString(),
  });
}
