// Short-lived caching for Google responses. Google's terms only allow
// temporary caching of Places content, so everything here expires in minutes.
//
// Two layers: a tiny per-isolate memory cache (always works) and the
// Cloudflare Cache API (shared across requests in a data centre; it is a
// no-op on some hostnames such as *.workers.dev, which is fine).

const memory = new Map<string, { expires: number; value: unknown }>();
const MEMORY_MAX = 500;

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const cacheKey = new Request(`https://round-trip.internal/cache/${encodeURIComponent(key)}`);
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : undefined;
  if (cache) {
    try {
      const res = await cache.match(cacheKey);
      if (res) {
        const value = (await res.json()) as T;
        remember(key, value, ttlSeconds);
        return value;
      }
    } catch {
      // Cache API unavailable – fall through to the loader.
    }
  }

  const value = await load();
  remember(key, value, ttlSeconds);
  if (cache) {
    try {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(value), {
          headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlSeconds}` },
        }),
      );
    } catch {
      // ignore
    }
  }
  return value;
}

function remember(key: string, value: unknown, ttlSeconds: number) {
  if (memory.size >= MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { expires: Date.now() + ttlSeconds * 1000, value });
}
