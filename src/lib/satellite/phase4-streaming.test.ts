import { describe, it, expect } from 'vitest';
import { planetaryEventBus } from './streaming';

describe('Phase 4 — Big Data Event Streaming & Real-Time Alerting', () => {
  it('publishes and subscribes to planetary change events', () => {
    const receivedEvents: any[] = [];
    const unsubscribe = planetaryEventBus.subscribe('geointel.change_detected', (evt) => {
      receivedEvents.push(evt);
    });

    const published = planetaryEventBus.publish(
      'geointel.change_detected',
      { change_pct: 14.2, classification: 'deforestation' },
      { name: 'Amazon Basin', bbox: [-60.5, -3.2, -60.0, -2.8], areaKm2: 250.0 }
    );

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].id).toBe(published.id);
    expect(receivedEvents[0].payload.change_pct).toBe(14.2);
    expect(receivedEvents[0].offset).toBeGreaterThan(0);

    unsubscribe();
  });

  it('supports batch event replay since offset', () => {
    const startOffset = planetaryEventBus.getStats().currentOffset;

    planetaryEventBus.publish('specialist.forest', { canopy_loss_km2: 12.5 });
    planetaryEventBus.publish('specialist.water', { flood_extent_km2: 45.0 });

    const newEvents = planetaryEventBus.getEventsSince(startOffset);
    expect(newEvents.length).toBeGreaterThanOrEqual(2);
    expect(newEvents.some((e) => e.topic === 'specialist.forest')).toBe(true);
    expect(newEvents.some((e) => e.topic === 'specialist.water')).toBe(true);
  });
});
