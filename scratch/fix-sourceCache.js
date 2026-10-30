const fs = require('fs');

const file = 'src/lib/sourceCache.ts';
let raw = fs.readFileSync(file, 'utf8');
const isCrlf = raw.includes('\r\n');
let code = raw.replace(/\r\n/g, '\n');

const newCachedSource = `export function cachedSource<T>(
  key: string,
  fetcher: () => Promise<T[]>,
  ttlMs: number = DEFAULT_TTL_MS,
  options?: { swr?: boolean }
): () => Promise<T[]> {
  return async () => {
    const now = Date.now();
    const entry = store.get(key) as Entry<T> | undefined;

    // Active cache hit: valid and within TTL
    if (entry && now < entry.expiresAt && entry.data.length > 0) return entry.data;

    // If a request is already in-flight:
    if (entry?.inflight) {
      // If SWR is enabled and we have stale data, serve stale immediately
      if (options?.swr && entry.data.length > 0) {
        return entry.data;
      }
      return entry.inflight;
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

    // If SWR option is enabled and we have stale data, return immediately!
    if (options?.swr && entry && entry.data.length > 0) {
      store.set(key, {
        data: entry.data,
        expiresAt: entry.expiresAt,
        inflight,
      } as Entry<unknown>);
      return entry.data;
    }

    // Non-SWR or Cold start with no cached data: caller awaits the inflight promise
    store.set(key, {
      data: entry?.data ?? [],
      expiresAt: entry?.expiresAt ?? 0,
      inflight,
    } as Entry<unknown>);
    evictIfNeeded();

    return inflight;
  };
}`;

const startIdx = code.indexOf('export function cachedSource<T>(');
const endIdx = code.indexOf('export function peekSource<T>(', startIdx);
if (startIdx !== -1 && endIdx !== -1) {
  code = code.slice(0, startIdx) + newCachedSource + '\n\n/** Read a source without triggering a fetch. */\n' + code.slice(endIdx);
  if (isCrlf) code = code.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, code, 'utf8');
  console.log('Successfully updated sourceCache.ts');
} else {
  console.error('Could not find slice indices in sourceCache.ts');
}
