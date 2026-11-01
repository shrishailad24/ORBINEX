/**
 * ORBINEX — Planetary Big Data Event Streamer & Real-Time Alert Bus
 * Workstream: Phase 4 (Big Data Streaming & Real-Time Geospatial Events)
 *
 * Implements a Kafka-compatible pub/sub architecture for satellite acquisitions,
 * change detection threshold breaches, and specialist AI inference streams.
 */

export interface PlanetaryStreamEvent<T = any> {
  id: string;
  topic: 'satellite.acquisition' | 'geointel.change_detected' | 'specialist.forest' | 'specialist.building' | 'specialist.water' | 'system.telemetry';
  timestamp: string;
  partition: number;
  offset: number;
  aoi?: {
    name?: string;
    bbox?: [number, number, number, number];
    areaKm2?: number;
  };
  payload: T;
}

export type EventSubscriber<T = any> = (event: PlanetaryStreamEvent<T>) => void;

class PlanetaryEventBus {
  private buffer: PlanetaryStreamEvent[] = [];
  private readonly maxBufferSize = 1000;
  private currentOffset = 0;
  private subscribers: Map<string, Set<EventSubscriber>> = new Map();

  constructor() {
    this.initDefaultTopics();
  }

  private initDefaultTopics() {
    const topics = [
      'satellite.acquisition',
      'geointel.change_detected',
      'specialist.forest',
      'specialist.building',
      'specialist.water',
      'system.telemetry',
    ];
    for (const t of topics) {
      this.subscribers.set(t, new Set());
    }
  }

  /**
   * Publishes an event to a topic, assigning offset and storing in ring buffer.
   */
  publish<T = any>(
    topic: PlanetaryStreamEvent['topic'],
    payload: T,
    aoi?: PlanetaryStreamEvent['aoi'],
    partition = 0
  ): PlanetaryStreamEvent<T> {
    this.currentOffset++;
    const event: PlanetaryStreamEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      topic,
      timestamp: new Date().toISOString(),
      partition,
      offset: this.currentOffset,
      aoi,
      payload,
    };

    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Notify subscribers
    const topicSubscribers = this.subscribers.get(topic);
    if (topicSubscribers) {
      for (const subscriber of topicSubscribers) {
        try {
          subscriber(event);
        } catch (err) {
          console.error(`[EventBus] Subscriber error on topic ${topic}:`, err);
        }
      }
    }

    return event;
  }

  /**
   * Subscribes to a specific topic. Returns an unsubscribe closure.
   */
  subscribe<T = any>(
    topic: PlanetaryStreamEvent['topic'],
    subscriber: EventSubscriber<T>
  ): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    const set = this.subscribers.get(topic)!;
    set.add(subscriber as EventSubscriber);

    return () => {
      set.delete(subscriber as EventSubscriber);
    };
  }

  /**
   * Fetches historical events since a given offset (batch consumption).
   */
  getEventsSince(offset: number, limit = 50): PlanetaryStreamEvent[] {
    return this.buffer
      .filter((e) => e.offset > offset)
      .slice(0, limit);
  }

  /**
   * Get buffer stats for system telemetry.
   */
  getStats() {
    return {
      bufferedEvents: this.buffer.length,
      currentOffset: this.currentOffset,
      activeSubscribers: Array.from(this.subscribers.entries()).reduce(
        (acc, [_, set]) => acc + set.size,
        0
      ),
    };
  }
}

// Global singleton instance
export const planetaryEventBus = new PlanetaryEventBus();
