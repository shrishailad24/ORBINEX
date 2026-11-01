import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('AI Assistant Regression Tests (Intent Discrimination & Safeguards)', () => {
  it('does NOT generate satellite report for informational "What can I do on ORBINEX?"', async () => {
    const req = new NextRequest('http://localhost:3000/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What can I do on ORBINEX?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.satelliteAction).toBeNull();
    expect(data.answer).toBeDefined();
    expect(data.answer.length).toBeGreaterThan(20);
  });

  it('does NOT generate satellite report for informational "How do I compare before and after satellite imagery?"', async () => {
    const req = new NextRequest('http://localhost:3000/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'How do I compare before and after satellite imagery?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.satelliteAction).toBeNull();
    expect(data.answer).toBeDefined();
  });

  it('does NOT generate satellite report for informational "How do I draw an Area of Interest (AOI) on the map?"', async () => {
    const req = new NextRequest('http://localhost:3000/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'How do I draw an Area of Interest (AOI) on the map?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.satelliteAction).toBeNull();
  });

  it('does NOT generate satellite report for informational "How do I generate and download a satellite PDF intelligence report?"', async () => {
    const req = new NextRequest('http://localhost:3000/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'How do I generate and download a satellite PDF intelligence report?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.satelliteAction).toBeNull();
  });

  it('DOES generate satelliteAction for explicit action request: "grnerate pdf of before and after image 2020 2024 bengaluru"', async () => {
    const req = new NextRequest('http://localhost:3000/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'grnerate pdf of before and after image 2020 2024 bengaluru',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.satelliteAction).toBeDefined();
    expect(data.satelliteAction.type).toBe('satellite_comparison');
    expect(data.satelliteAction.locationName).toContain('Bengaluru');
    expect(data.satelliteAction.beforeDate).toContain('2020');
    expect(data.satelliteAction.afterDate).toContain('2024');
  });

  it('DOES generate satelliteAction for action query: "can u generate bengluru brfore/after img"', async () => {
    const req = new NextRequest('http://localhost:3000/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'can u generate bengluru brfore/after img',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.satelliteAction).toBeDefined();
    expect(data.satelliteAction.locationName).toContain('Bengaluru');
  });
});
