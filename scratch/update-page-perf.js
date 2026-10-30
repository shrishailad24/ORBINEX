const fs = require('fs');

const file = 'src/app/page.tsx';
let raw = fs.readFileSync(file, 'utf8');
const isCrlf = raw.includes('\r\n');
let code = raw.replace(/\r\n/g, '\n');

// 1. Add geocodeAbortRef and inflightEndpointRequests
const oldRefs = `  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);`;

const newRefs = `  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);
  const inflightEndpointRequests = useRef<Map<string, Promise<boolean>>>(new Map());`;

if (code.includes(oldRefs)) {
  code = code.replace(oldRefs, newRefs);
  console.log('Added geocodeAbortRef and inflightEndpointRequests');
} else {
  console.error('Could not find oldRefs');
}

// 2. Update handleMouseCoords with AbortController
const oldHandleMouseCoords = `  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    mouseCoordsRef.current = coords;
    if (coordsDisplayRef.current) {
      coordsDisplayRef.current.innerText = \`\${coords.lat.toFixed(4)}, \${coords.lng.toFixed(4)}\`;
    }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const d = Math.abs(coords.lat - lastGeocodedPos.current.lat) + Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (d < 0.5) return; // increased threshold — fewer geocode calls
      }
      const gk = \`\${coords.lat.toFixed(1)},\${coords.lng.toFixed(1)}\`; // coarser grid = more cache hits
      if (geocodeCache.current.has(gk)) { setLocationLabel(geocodeCache.current.get(gk)!); lastGeocodedPos.current = coords; return; }
      try {
        /* Our own route, not Nominatim directly: it rounds the coordinate,
           caches the answer for everyone, and holds the app's request budget
           for the service — see lib/nominatim.ts. */
        const res = await fetch(\`/api/geo/reverse?lat=\${coords.lat}&lng=\${coords.lng}\`);
        if (res.ok) {
          const d = await res.json();
          const label = d.label || 'Unknown';
          if (geocodeCache.current.size > 500) { const it = geocodeCache.current.keys(); for (let i=0;i<100;i++) { const k = it.next().value; if(k) geocodeCache.current.delete(k); }}
          geocodeCache.current.set(gk, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }
    }, 3000); // 3s debounce (was 1.5s)
  }, []);`;

const newHandleMouseCoords = `  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    mouseCoordsRef.current = coords;
    if (coordsDisplayRef.current) {
      coordsDisplayRef.current.innerText = \`\${coords.lat.toFixed(4)}, \${coords.lng.toFixed(4)}\`;
    }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const d = Math.abs(coords.lat - lastGeocodedPos.current.lat) + Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (d < 0.5) return; // increased threshold — fewer geocode calls
      }
      const gk = \`\${coords.lat.toFixed(1)},\${coords.lng.toFixed(1)}\`; // coarser grid = more cache hits
      if (geocodeCache.current.has(gk)) { setLocationLabel(geocodeCache.current.get(gk)!); lastGeocodedPos.current = coords; return; }
      
      // Abort previous in-flight reverse geocode to eliminate request pile-up
      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
      }
      const controller = new AbortController();
      geocodeAbortRef.current = controller;

      try {
        const res = await fetch(\`/api/geo/reverse?lat=\${coords.lat}&lng=\${coords.lng}\`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const d = await res.json();
          const label = d.label || 'Unknown';
          if (geocodeCache.current.size > 500) { const it = geocodeCache.current.keys(); for (let i=0;i<100;i++) { const k = it.next().value; if(k) geocodeCache.current.delete(k); }}
          geocodeCache.current.set(gk, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('[ORBINEX] Geocode error:', e instanceof Error ? e.message : e);
        }
      }
    }, 1500); // responsive 1.5s debounce
  }, []);`;

if (code.includes(oldHandleMouseCoords)) {
  code = code.replace(oldHandleMouseCoords, newHandleMouseCoords);
  console.log('Updated handleMouseCoords with AbortController');
} else {
  console.error('Could not find oldHandleMouseCoords');
}

// 3. Update fetchEndpoint with in-flight deduplication
const oldFetchEndpoint = `  const fetchEndpoint = useCallback(async (
    url: string,
    transform?: (d: any) => any,
    options?: RequestInit,
    { skipWhenHidden = false }: { skipWhenHidden?: boolean } = {},
  ): Promise<boolean> => {
    if (skipWhenHidden && typeof document !== 'undefined' && document.hidden) return false;
    try {
      // Force the browser to bypass its local disk cache for real-time data
      const res = await fetch(url, { ...options, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const d = transform ? transform(json) : json;
        dataRef.current = { ...dataRef.current, ...d };
        setDataVersion(v => v + 1);
        setBackendStatus('connected');
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e);
      setBackendStatus('error');
      return false;
    }
  }, []);`;

const newFetchEndpoint = `  const fetchEndpoint = useCallback(async (
    url: string,
    transform?: (d: any) => any,
    options?: RequestInit,
    { skipWhenHidden = false }: { skipWhenHidden?: boolean } = {},
  ): Promise<boolean> => {
    if (skipWhenHidden && typeof document !== 'undefined' && document.hidden) return false;
    
    // Deduplicate concurrent in-flight requests to identical endpoint URLs
    const existingPromise = inflightEndpointRequests.current.get(url);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      try {
        const res = await fetch(url, options);
        if (res.ok) {
          const json = await res.json();
          const d = transform ? transform(json) : json;
          dataRef.current = { ...dataRef.current, ...d };
          setDataVersion(v => v + 1);
          setBackendStatus('connected');
          return true;
        }
        return false;
      } catch (e) {
        console.warn('[ORBINEX] Fetch error:', e instanceof Error ? e.message : e);
        setBackendStatus('error');
        return false;
      } finally {
        inflightEndpointRequests.current.delete(url);
      }
    })();

    inflightEndpointRequests.current.set(url, promise);
    return promise;
  }, []);`;

if (code.includes(oldFetchEndpoint)) {
  code = code.replace(oldFetchEndpoint, newFetchEndpoint);
  console.log('Updated fetchEndpoint with in-flight deduplication');
} else {
  console.error('Could not find oldFetchEndpoint');
}

if (isCrlf) {
  code = code.replace(/\n/g, '\r\n');
}
fs.writeFileSync(file, code, 'utf8');
console.log('Finished updating ' + file);
