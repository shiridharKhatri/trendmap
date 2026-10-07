/**
 * Ultra-fast client-side in-memory & sessionStorage cache with Stale-While-Revalidate (SWR) support.
 * Prevents redundant server requests and eliminates page loading flickers when navigating between dashboard tabs.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface ClientCacheEntry<T> {
  data: T;
  isFresh: boolean;
  ageMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function getClientCacheEntry<T>(
  key: string,
  freshMs = 120_000,
  maxAgeMs = 600_000
): ClientCacheEntry<T> | null {
  // 1. In-memory lookup (0ms instantaneous)
  let entry = memoryCache.get(key);

  // 2. SessionStorage lookup fallback
  if (!entry && typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(`tm_c_${key}`);
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < maxAgeMs) {
          entry = parsed;
          memoryCache.set(key, parsed);
        }
      }
    } catch {
      // Ignore parse/quota errors
    }
  }

  if (!entry) return null;

  const ageMs = Date.now() - entry.timestamp;
  if (ageMs >= maxAgeMs) {
    memoryCache.delete(key);
    return null;
  }

  return {
    data: entry.data as T,
    isFresh: ageMs < freshMs,
    ageMs,
  };
}

export function getClientCached<T>(key: string, maxAgeMs = 600_000): T | null {
  const entry = getClientCacheEntry<T>(key, maxAgeMs, maxAgeMs);
  return entry ? entry.data : null;
}

export function setClientCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(`tm_c_${key}`, JSON.stringify(entry));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function invalidateClientCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    if (typeof window !== "undefined") {
      try {
        const keys = Object.keys(sessionStorage);
        for (const k of keys) {
          if (k.startsWith("tm_c_")) {
            sessionStorage.removeItem(k);
          }
        }
      } catch {}
    }
    return;
  }

  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(prefix)) {
      memoryCache.delete(k);
    }
  }

  if (typeof window !== "undefined") {
    try {
      const keys = Object.keys(sessionStorage);
      for (const k of keys) {
        if (k.startsWith(`tm_c_${prefix}`)) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {}
  }
}
