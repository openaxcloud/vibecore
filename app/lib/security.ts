import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  securityLanguageForRequest,
  securityServerMessage,
  type SecurityServerLanguage,
} from './i18n/catalogs/security-server';

// Rate limiting store (in-memory for serverless environments)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// Rate limit configuration
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // General API endpoints
  '/api/*': { windowMs: 15 * 60 * 1000, maxRequests: 100 }, // 100 requests per 15 minutes

  // LLM API (more restrictive)
  '/api/llmcall': { windowMs: 60 * 1000, maxRequests: 10 }, // 10 requests per minute

  // GitHub API endpoints
  '/api/github-*': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests per minute

  // Netlify API endpoints
  '/api/netlify-*': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests per minute
};

/**
 * Select the rate-limit rule for an endpoint, preferring the MOST specific match.
 *
 * Object.entries() yields keys in insertion order, so a plain `.find()` would
 * always pick the catch-all '/api/*' rule (declared first) and the stricter
 * '/api/llmcall', '/api/github-*' and '/api/netlify-*' rules would be dead config.
 * Candidates are ranked: exact path > longest matching prefix, so the tightest
 * applicable rule always wins before falling back to broader ones.
 */
export function selectRateLimitRule(
  endpoint: string,
  rules: Record<string, RateLimitConfig> = RATE_LIMITS,
): RateLimitConfig | undefined {
  let best: { config: RateLimitConfig; specificity: number } | undefined;

  for (const [pattern, config] of Object.entries(rules)) {
    let specificity: number | undefined;

    if (pattern.endsWith('*')) {
      // Wildcard prefix rule, e.g. '/api/*', '/api/github-*'.
      const basePattern = pattern.slice(0, -1);

      if (endpoint.startsWith(basePattern)) {
        // Longer prefixes are more specific than shorter ones.
        specificity = basePattern.length;
      }
    } else if (endpoint === pattern) {
      // Exact matches always beat any prefix match.
      specificity = Number.MAX_SAFE_INTEGER;
    }

    if (specificity !== undefined && (!best || specificity > best.specificity)) {
      best = { config, specificity };
    }
  }

  return best?.config;
}

/**
 * Rate limiting middleware
 */
export function checkRateLimit(request: Request, endpoint: string): { allowed: boolean; resetTime?: number } {
  const clientIP = getClientIP(request);
  const key = `${clientIP}:${endpoint}`;

  // Find matching rate limit rule (most specific first; see selectRateLimitRule)
  const config = selectRateLimitRule(endpoint);

  if (!config) {
    return { allowed: true }; // No rate limit for this endpoint
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Clean up old entries
  for (const [storedKey, data] of rateLimitStore.entries()) {
    if (data.resetTime < windowStart) {
      rateLimitStore.delete(storedKey);
    }
  }

  /*
   * Get or create/roll rate limit data. Roll the window once it has expired,
   * otherwise the count kept accumulating across windows and a client that once
   * hit the cap stayed blocked until the entry was GC'd (no per-window reset).
   */
  let rateLimitData = rateLimitStore.get(key);

  if (!rateLimitData || now >= rateLimitData.resetTime) {
    rateLimitData = { count: 0, resetTime: now + config.windowMs };
  }

  if (rateLimitData.count >= config.maxRequests) {
    return { allowed: false, resetTime: rateLimitData.resetTime };
  }

  // Update rate limit data
  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);

  return { allowed: true };
}

/**
 * Get client IP address from request
 */
function getClientIP(request: Request): string {
  /*
   * Only trust headers the infrastructure actually sets. The prod ingress
   * (nginx) overwrites x-real-ip with the real peer and APPENDS it to
   * x-forwarded-for, so:
   *  - x-real-ip is trustworthy.
   *  - in x-forwarded-for the RIGHTMOST entry is the one the trusted proxy added;
   *    the LEFTMOST is client-controlled (an attacker sends
   *    `X-Forwarded-For: <victim>` to spoof another bucket / evade rate limits).
   *  - cf-connecting-ip is NOT used: there is no Cloudflare in front of prod, so
   *    a client can forge it freely.
   */
  const realIP = request.headers.get('x-real-ip');

  if (realIP?.trim()) {
    return realIP.trim();
  }

  const forwardedFor = request.headers.get('x-forwarded-for');

  if (forwardedFor) {
    const parts = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return 'unknown';
}

/**
 * Security headers middleware
 */
export function createSecurityHeaders() {
  return {
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Enable XSS protection
    'X-XSS-Protection': '1; mode=block',

    // Content Security Policy - restrict to same origin and trusted sources
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // Inline styles remain until the app has a nonce/hash style pipeline.
      "img-src 'self' data: https: blob:", // Allow images from same origin, data URLs, and HTTPS
      "font-src 'self' data:", // Allow fonts from same origin and data URLs
      "connect-src 'self' https://api.github.com https://api.netlify.com", // Allow connections to GitHub and Netlify APIs
      "frame-src 'none'", // Prevent iframe embedding
      "object-src 'none'", // Prevent object embedding
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),

    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions Policy (formerly Feature Policy)
    'Permissions-Policy': ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()'].join(', '),

    // HSTS (HTTP Strict Transport Security) - only in production
    ...(process.env.NODE_ENV === 'production'
      ? {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        }
      : {}),
  };
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Basic length checks for different providers
  const minLengths: Record<string, number> = {
    anthropic: 50,
    openai: 50,
    groq: 50,
    google: 30,
    github: 30,
    netlify: 30,
  };

  const minLength = minLengths[provider.toLowerCase()] || 20;

  return apiKey.length >= minLength && !apiKey.includes('your_') && !apiKey.includes('here');
}

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeErrorMessage(
  error: unknown,
  isDevelopment = false,
  language: SecurityServerLanguage = 'en',
): string {
  if (isDevelopment) {
    // In development, show full error details
    return error instanceof Error ? error.message : String(error);
  }

  // In production, show generic messages to prevent information leakage
  if (error instanceof Error) {
    // Check for sensitive information in error messages
    if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('secret')) {
      return securityServerMessage('authenticationFailed', language);
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return securityServerMessage('rateLimitExceeded', language);
    }
  }

  return securityServerMessage('unexpectedError', language);
}

function localeResponseHeaders(language: SecurityServerLanguage): Record<string, string> {
  return { 'Content-Language': language, Vary: 'Accept-Language' };
}

/**
 * Security wrapper for API routes
 */
export function withSecurity<T extends (args: ActionFunctionArgs | LoaderFunctionArgs) => Promise<Response>>(
  handler: T,
  options: {
    /*
     * NOTE: there is intentionally no `requireAuth` option. The wrapper enforces
     * only method allowlisting, rate limiting, and security headers; it has no
     * session/auth mechanism (auth is delegated to the API). A `requireAuth` flag
     * here was removed because it was never enforced — passing it would have been a
     * silent auth-bypass footgun. Gate authentication in the API layer instead.
     */
    rateLimit?: boolean;
    allowedMethods?: string[];
  } = {},
) {
  return async (args: ActionFunctionArgs | LoaderFunctionArgs): Promise<Response> => {
    const { request } = args;
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const language = securityLanguageForRequest(request);

    // Check allowed methods
    if (options.allowedMethods && !options.allowedMethods.includes(request.method)) {
      return new Response(securityServerMessage('methodNotAllowed', language), {
        status: 405,
        headers: { ...createSecurityHeaders(), ...localeResponseHeaders(language) },
      });
    }

    // Apply rate limiting
    if (options.rateLimit !== false) {
      const rateLimitResult = checkRateLimit(request, endpoint);

      if (!rateLimitResult.allowed) {
        return new Response(securityServerMessage('rateLimitExceeded', language), {
          status: 429,
          headers: {
            ...createSecurityHeaders(),
            ...localeResponseHeaders(language),
            'Retry-After': Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000).toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime!.toString(),
          },
        });
      }
    }

    try {
      // Execute the handler
      const response = await handler(args);

      // Add security headers to response
      const responseHeaders = new Headers(response.headers);
      Object.entries(createSecurityHeaders()).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      responseHeaders.set('Content-Language', language);

      const vary = responseHeaders.get('Vary');

      const varyValues = (vary ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (!varyValues.some((value) => value.toLowerCase() === 'accept-language')) {
        varyValues.push('Accept-Language');
      }

      responseHeaders.set('Vary', varyValues.join(', '));

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error('Security-wrapped handler error:', error);

      const errorMessage = sanitizeErrorMessage(error, process.env.NODE_ENV === 'development', language);

      return new Response(
        JSON.stringify({
          error: true,
          message: errorMessage,
        }),
        {
          status: 500,
          headers: {
            ...createSecurityHeaders(),
            ...localeResponseHeaders(language),
            'Content-Type': 'application/json',
          },
        },
      );
    }
  };
}
