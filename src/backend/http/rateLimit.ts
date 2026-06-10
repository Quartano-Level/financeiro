import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Rate limiters protecting the Express layer against request floods
 * (arch-review card security-6 / F-security-9). The strict limiter guards
 * the heavy report/analysis routes whose fan-out to the Conexos ERP can
 * exhaust its session pool.
 */

/** Global limiter — ~100 requests per minute per IP. */
export const globalLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});

/** Strict limiter — ~10 requests per minute per IP, for heavy routes. */
export const heavyRouteLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});
