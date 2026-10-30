const fs = require('fs');

const file = 'src/lib/sourceCache.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace cachedSource implementation with SWR
const oldCachedSource = `export function cachedSource<T>(
  key: string,
  fetcher: () => Promise<T[]>,
  ttlMs: number = DEFAULT_TTL_MS,
): () => Promise<T[]> {
  return async () => {
    const now = Date.now();
    const entry = store.get(key) as Entry<T> | undefined;

    if (entry && now < entry.expiresAt && entry.data.length > 0) return entry.data;
    if (entry?.inflight) return entry.inflight;

    const inflight = (async () => {
      try {
        const data = await fetcher();
        // An empty result is treated as a failed refresh: keep whatever we had.
        if (data.length === 0 && entry?.data.length) {
          store.set(key, { data: entry.data, expiresAt: now + ttlMs, inflight: null });
          return entry.data;
        }
        store.set(key, { data, expiresAt: now + ttlMs, inflight: null });
        return data;
      } catch (e) {
        if (entry?.data.length) {
          console.warn(\`[OSIRIS] \${key} refresh failed — serving \${entry.data.length} cached cameras\`);
          // Retry sooner than a full TTL, but don't hammer the failing upstream.
          store.set(key, { data: entry.data, expiresAt: now + 60_000, inflight: null });
          return entry.data;
        }
        console.warn(\`[OSIRIS] \${key} fetch failed with no cache to fall back on:\`, e);
        store.set(key, { data: [], expiresAt: now + 60_000, inflight: null });
        return [];
      }
    })();

    store.set(key, {
      data: entry?.data ?? [],
      expiresAt: entry?.expiresAt ?? 0,
      inflight,
    } as Entry<unknown>);
    evictIfNeeded();

    return inflight;
  };
}`;

const newCachedSource = `export function cachedSource<T>(
  key: string,
  fetcher: () => Promise<T[]>,
  ttlMs: number = DEFAULT_TTL_MS,
): () => Promise<T[]> {
  return async () => {
    const now = Date.now();
    const entry = store.get(key) as Entry<T> | undefined;

    // SWR: If we have valid data and haven't expired, return instantly (< 1ms)
    if (entry && now < entry.expiresAt && entry.data.length > 0) return entry.data;

    // SWR: If we have stale data and an in-flight background refresh is already running,
    // return the stale data immediately without blocking!
    if (entry && entry.data.length > 0 && entry.inflight) {
      return entry.data;
    }

    // Launch refresh
    const inflight = (async () => {
      try {
        const data = await fetcher();
        // An empty result is treated as a failed refresh: keep whatever we had.
        if (data.length === 0 && entry?.data.length) {
          store.set(key, { data: entry.data, expiresAt: Date.now() + ttlMs, inflight: null });
          return entry.data;
        }
        store.set(key, { data, expiresAt: Date.now() + ttlMs, inflight: null });
        return data;
      } catch (e) {
        if (entry?.data.length) {
          console.warn(\`[ORBINEX] \${key} refresh failed — serving \${entry.data.length} cached items\`);
          store.set(key, { data: entry.data, expiresAt: Date.now() + 60_000, inflight: null });
          return entry.data;
        }
        console.warn(\`[ORBINEX] \${key} fetch failed with no cache to fall back on:\`, e);
        store.set(key, { data: [], expiresAt: Date.now() + 60_000, inflight: null });
        return [];
      }
    })();

    // SWR: If we already have stale data, serve it IMMEDIATELY and let the refresh run in background!
    if (entry && entry.data.length > 0) {
      store.set(key, {
        data: entry.data,
        expiresAt: entry.expiresAt,
        inflight,
      } as Entry<unknown>);
      return entry.data;
    }

    // Cold start with no cached data: caller must await the initial fetch
    store.set(key, {
      data: [],
      expiresAt: 0,
      inflight,
    } as Entry<unknown>);
    evictIfNeeded();

    return inflight;
  };
}`;

if (code.includes('export function cachedSource<T>(')) {
  const startIdx = code.indexOf('export function cachedSource<T>(');
  const endIdx = code.indexOf('export function peekSource<T>(', startIdx);
  if (startIdx !== -1 && endIdx !== -1) {
    code = code.slice(0, startIdx) + newCachedSource + '\n\n' + code.slice(endIdx);
    fs.writeFileSync(file, code, 'utf8');
    console.log('Successfully updated cachedSource with SWR in ' + file);
  } else {
    console.error('Could not find slice indices');
  }
} else {
  console.error('Pattern not found');
}
