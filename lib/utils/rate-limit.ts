/**
 * Simple in-memory rate limiting
 * Low-friction rate limiting for authentication endpoints
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (clears on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 10, // 10 requests
  windowMs: 15 * 60 * 1000, // per 15 minutes
};

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address, email)
 * @param options - Rate limit options
 * @returns true if rate limited, false otherwise
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = DEFAULT_OPTIONS
): { rateLimited: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier.toLowerCase();
  
  const entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    // No entry or expired, create new one
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    rateLimitStore.set(key, newEntry);
    return {
      rateLimited: false,
      remaining: options.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }
  
  // Entry exists and is valid
  if (entry.count >= options.maxRequests) {
    return {
      rateLimited: true,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }
  
  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    rateLimited: false,
    remaining: options.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client identifier from request
 * Uses IP address or email if available
 */
export function getClientIdentifier(request: Request, email?: string): string {
  // Prefer email if provided (more specific)
  if (email) {
    return `email:${email}`;
  }
  
  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

