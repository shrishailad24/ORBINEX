import { planetaryEventBus } from '@/lib/satellite/streaming';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic') as any || 'geointel.change_detected';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection packet
      const initData = `data: ${JSON.stringify({ type: 'connected', topic, timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(initData));

      // Subscribe to real-time events on the bus
      const unsubscribe = planetaryEventBus.subscribe(topic, (event) => {
        const msg = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(msg));
      });

      // Heartbeat ping every 15 seconds to prevent browser disconnection
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
