type RateLimitRecord = {
  timestamps: number[];
};

const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up old entries periodically to avoid memory leaks
if (typeof globalThis !== "undefined" && typeof setInterval !== "undefined") {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < 60000);
      if (record.timestamps.length === 0) {
        rateLimitMap.delete(key);
      }
    }
  }, 60000);
  if (interval && typeof interval.unref === "function") {
    interval.unref();
  }
}

/**
 * Checks if a key has exceeded the rate limit.
 * @param key Unique identifier (e.g. IP address or combination of IP and endpoint)
 * @param limit Maximum number of requests allowed in the window (default 15)
 * @param windowMs Time window in milliseconds (default 60000)
 * @returns true if rate limited, false otherwise
 */
export function isRateLimited(key: string, limit = 15, windowMs = 60000): boolean {
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(key, record);
  }

  // Filter timestamps within the window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= limit) {
    return true;
  }

  record.timestamps.push(now);
  return false;
}

/**
 * Resets all rate limits. Primarily used in test suites.
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}
