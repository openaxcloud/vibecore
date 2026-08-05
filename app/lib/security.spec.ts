import { describe, expect, it } from 'vitest';
import {
  createSecurityHeaders,
  sanitizeErrorMessage,
  selectRateLimitRule,
  withSecurity,
  type RateLimitConfig,
} from './security';

describe('createSecurityHeaders', () => {
  it('does not allow inline or eval scripts in CSP', () => {
    const csp = createSecurityHeaders()['Content-Security-Policy'];

    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptSrc).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});

describe('selectRateLimitRule', () => {
  it('applies the catch-all /api/* rule to a generic endpoint', () => {
    const rule = selectRateLimitRule('/api/something');
    expect(rule).toEqual({ windowMs: 15 * 60 * 1000, maxRequests: 100 });
  });

  it('prefers the exact /api/llmcall rule over the catch-all', () => {
    const rule = selectRateLimitRule('/api/llmcall');

    // 10/min, NOT the loose 100/15min — the regression made this unreachable.
    expect(rule).toEqual({ windowMs: 60 * 1000, maxRequests: 10 });
  });

  it('prefers the /api/github-* prefix rule over the catch-all', () => {
    const rule = selectRateLimitRule('/api/github-repos');
    expect(rule).toEqual({ windowMs: 60 * 1000, maxRequests: 30 });
  });

  it('prefers the /api/netlify-* prefix rule over the catch-all', () => {
    const rule = selectRateLimitRule('/api/netlify-deploy');
    expect(rule).toEqual({ windowMs: 60 * 1000, maxRequests: 20 });
  });

  it('returns undefined for endpoints with no matching rule', () => {
    expect(selectRateLimitRule('/healthz')).toBeUndefined();
  });

  it('ranks an exact match above a prefix match regardless of insertion order', () => {
    const rules: Record<string, RateLimitConfig> = {
      '/api/*': { windowMs: 1000, maxRequests: 100 },
      '/api/exact': { windowMs: 1000, maxRequests: 1 },
    };
    expect(selectRateLimitRule('/api/exact', rules)).toEqual({ windowMs: 1000, maxRequests: 1 });
  });

  it('ranks a longer prefix above a shorter prefix regardless of insertion order', () => {
    const rules: Record<string, RateLimitConfig> = {
      '/api/*': { windowMs: 1000, maxRequests: 100 },
      '/api/github-*': { windowMs: 1000, maxRequests: 30 },
    };

    // Even with the catch-all declared first, the longer prefix must win.
    expect(selectRateLimitRule('/api/github-x', rules)).toEqual({ windowMs: 1000, maxRequests: 30 });
  });
});

describe('localized security responses', () => {
  it('sanitizes sensitive production errors in the requested language', () => {
    expect(sanitizeErrorMessage(new Error('API key leaked'), false, 'fr')).toBe('L’authentification a échoué.');
    expect(sanitizeErrorMessage(new Error('upstream rate limit: 429'), false, 'fr')).toBe(
      'Limite de requêtes dépassée. Veuillez réessayer plus tard.',
    );
    expect(sanitizeErrorMessage(new Error('database exploded'), false, 'fr')).toBe(
      'Une erreur inattendue est survenue.',
    );
  });

  it('uses the manual language cookie before Accept-Language and marks the response variant', async () => {
    const secured = withSecurity(async () => new Response('ok'), {
      allowedMethods: ['POST'],
      rateLimit: false,
    });
    const response = await secured({
      request: new Request('https://example.test/api/example', {
        method: 'GET',
        headers: {
          cookie: 'vibecore-lang=fr',
          'accept-language': 'en-US,en;q=0.9',
        },
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(405);
    expect(await response.text()).toBe('Méthode non autorisée.');
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toContain('Accept-Language');
  });
});
