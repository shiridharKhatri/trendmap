/**
 * Ultra-fast client-side in-memory & sessionStorage cache with Stale-While-Revalidate (SWR) support.
 * Prevents redundant server requests and eliminates page loading flickers when navigating between dashboard tabs.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function getClientCached<T>(key: string, maxAgeMs = 600_000): T | null {
  // 1. In-memory lookup (0ms instantaneous)
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < maxAgeMs) {
    return mem.data as T;
  }

  // 2. SessionStorage lookup (instant restore across page navigations in same session)
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(`tm_c_${key}`);
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.timestamp < maxAgeMs) {
          memoryCache.set(key, entry);
          return entry.data;
        }
      }
    } catch {
      // Ignore quota or parse errors
    }
  }

  return null;
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
