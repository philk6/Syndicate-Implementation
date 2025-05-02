/**
 * Simple in-memory cache implementation for API responses
 * Used to reduce database load and improve performance
 */

// Cache storage
type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

// Default time-to-live: 60 seconds
const DEFAULT_TTL = 60 * 1000;

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ttl: number;

  constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
  }

  /**
   * Get a value from cache if fresh, otherwise execute the fetch function
   * @param key Cache key
   * @param fetchFn Function to execute if cache miss or expired
   * @param customTtl Optional custom TTL for this specific item
   */
  async get<T>(key: string, fetchFn: () => Promise<T>, customTtl?: number): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    const ttl = customTtl ?? this.ttl;
    
    // Return cached value if still fresh
    if (cached && now - cached.timestamp < ttl) {
      console.log(`[CACHE] Hit: ${key}`);
      return cached.data as T;
    }
    
    console.log(`[CACHE] Miss: ${key}`);
    
    // Fetch fresh data
    const data = await fetchFn();
    
    // Store in cache
    this.cache.set(key, { data, timestamp: now });
    
    return data;
  }

  /**
   * Manually set a value in the cache
   * @param key Cache key
   * @param data Data to store
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Delete a specific cache entry
   * @param key Cache key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete all cache entries that match a prefix
   * @param prefix Key prefix to match
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Create a singleton instance
export const cache = new SimpleCache();

// Create a cache for queries that should last longer (5 minutes)
export const longCache = new SimpleCache(5 * 60 * 1000);

// Helper function to create a cache key from parts
export function createCacheKey(...parts: (string | number | boolean | undefined)[]): string {
  return parts.filter(p => p !== undefined).join(':');
} 