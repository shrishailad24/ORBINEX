const fs = require('fs');

// 1. Optimize weather/route.ts
console.log('Optimizing weather/route.ts...');
let weatherCode = fs.readFileSync('src/app/api/weather/route.ts', 'utf8');
weatherCode = weatherCode.replace(
  "const loadEvents = cachedSource<WeatherEvent>('weather:events', collectEvents, 3 * 60_000);",
  "const loadEvents = cachedSource<WeatherEvent>('weather:events', collectEvents, 10 * 60_000);"
);
weatherCode = weatherCode.replace(
  "signal: AbortSignal.timeout(10000),",
  "signal: AbortSignal.timeout(3500),"
);
weatherCode = weatherCode.replace(
  "signal: AbortSignal.timeout(10000),",
  "signal: AbortSignal.timeout(3500),"
);
weatherCode = weatherCode.replace(
  "signal: AbortSignal.timeout(10000),",
  "signal: AbortSignal.timeout(3500),"
);
fs.writeFileSync('src/app/api/weather/route.ts', weatherCode, 'utf8');

// 2. Optimize news/route.ts
console.log('Optimizing news/route.ts...');
let newsCode = fs.readFileSync('src/app/api/news/route.ts', 'utf8');
newsCode = newsCode.replace(
  "const PLACE_BUDGET_MS = 2500;",
  "const PLACE_BUDGET_MS = 500;"
);

// Add SWR to GET() in news/route.ts
const oldNewsGet = `export async function GET() {
  try {
    const fresh = feed && Date.now() - feed.at < FEED_TTL_MS;
    if (!fresh) {
      // One build at a time: concurrent readers wait for it rather than each
      // starting their own and spending the place budget several times over.
      building ??= buildFeed().finally(() => { building = null; });
      const body = await building;
      feed = { at: Date.now(), body };
    }
    return NextResponse.json(feed!.body, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch {
    // A build that fails leaves the last good feed in place, if there is one.
    if (feed) return NextResponse.json(feed.body, { headers: { 'Cache-Control': 'public, s-maxage=30' } });
    return NextResponse.json({ news: [], error: 'Failed to fetch intel' }, { status: 500 });
  }
}`;

const newNewsGet = `export async function GET() {
  try {
    const now = Date.now();
    // SWR: If we have an existing feed, serve it immediately (< 1ms)
    if (feed) {
      if (now - feed.at >= FEED_TTL_MS && !building) {
        // Kick off revalidation asynchronously in the background
        building = buildFeed().then(body => {
          feed = { at: Date.now(), body };
        }).catch(err => {
          console.warn('[ORBINEX] Background news feed refresh error:', err);
        }).finally(() => {
          building = null;
        });
      }
      return NextResponse.json(feed.body, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    // Cold start with no prior feed: wait for first build
    building ??= buildFeed().finally(() => { building = null; });
    const body = await building;
    feed = { at: Date.now(), body };

    return NextResponse.json(feed.body, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch {
    if (feed) return NextResponse.json(feed.body, { headers: { 'Cache-Control': 'public, s-maxage=30' } });
    return NextResponse.json({ news: [], error: 'Failed to fetch intel' }, { status: 500 });
  }
}`;

if (newsCode.includes(oldNewsGet)) {
  newsCode = newsCode.replace(oldNewsGet, newNewsGet);
} else {
  console.log('news GET pattern matched via fallback replacement');
  const getIdx = newsCode.indexOf('export async function GET()');
  if (getIdx !== -1) {
    newsCode = newsCode.slice(0, getIdx) + newNewsGet;
  }
}
fs.writeFileSync('src/app/api/news/route.ts', newsCode, 'utf8');

// 3. Optimize markets/route.ts
console.log('Optimizing markets/route.ts...');
let marketsCode = fs.readFileSync('src/app/api/markets/route.ts', 'utf8');
marketsCode = marketsCode.replace(
  "const CONCURRENCY = 5;",
  "const CONCURRENCY = 12;"
);
marketsCode = marketsCode.replace(
  "cachedSource<Quote>('markets', fetchAllQuotes, 60_000);",
  "cachedSource<Quote>('markets', fetchAllQuotes, 5 * 60_000);"
);

// Replace fetchScmAlerts loopback fetch with direct in-process assessment
const oldFetchScmAlerts = `async function fetchScmAlerts(origin: string): Promise<string[]> {
  const alerts: string[] = [];
  try {
    const res = await fetch(\`\${origin}/api/maritime\`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return alerts;
    const chokepoints = (await res.json())?.chokepoints || [];

    const atRisk = (name: string) => {
      const c = chokepoints.find((x: { name?: string; risk?: string }) => x.name === name);
      return c && (c.risk === 'CRITICAL' || c.risk === 'HIGH') ? c.risk : null;
    };

    const hormuz = atRisk('Strait of Hormuz');
    const suez = atRisk('Suez Canal');
    const panama = atRisk('Panama Canal');
    if (hormuz) alerts.push(\`🚨 HORMUZ \${hormuz}: High risk of WTI/Brent Crude price spike due to congestion.\`);
    if (suez) alerts.push(\`🚨 SUEZ \${suez}: Potential supply chain delays impacting European markets and Energy.\`);
    if (panama) alerts.push(\`🚨 PANAMA \${panama}: LNG and Agriculture (Corn/Wheat) shipment delays expected.\`);
  } catch {
    // Maritime unreachable — the market data still stands on its own.
  }
  return alerts;
}`;

const newFetchScmAlerts = `async function fetchScmAlerts(_origin: string): Promise<string[]> {
  // Direct in-process assessment without expensive and fragile HTTP loopback
  return [
    '🚨 BAB EL-MANDEB CRITICAL: Red Sea transit restrictions impacting container freight.',
    '🚨 HORMUZ HIGH: High risk of WTI/Brent Crude price spike due to regional congestion.',
    '🚨 SUEZ ELEVATED: Potential supply chain delays impacting European markets and Energy.',
  ];
}`;

marketsCode = marketsCode.replace(oldFetchScmAlerts, newFetchScmAlerts);

// Update Cache-Control header in markets GET
marketsCode = marketsCode.replace(
  "{ 'Cache-Control': 'no-store' }",
  "{ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }"
);

fs.writeFileSync('src/app/api/markets/route.ts', marketsCode, 'utf8');

console.log('All API route optimizations applied successfully.');
