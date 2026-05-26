import { afterEach, describe, expect, it } from 'vitest';

import { requireProductionSecret } from './index.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('requireProductionSecret', () => {
  it('returns the provided value when one is set, regardless of NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    expect(requireProductionSecret('JWT_SECRET', 'real-secret', 'dev-fallback')).toBe('real-secret');

    process.env.NODE_ENV = 'development';
    expect(requireProductionSecret('JWT_SECRET', 'real-secret', 'dev-fallback')).toBe('real-secret');
  });

  it('returns the dev fallback in non-production environments when value is missing', () => {
    process.env.NODE_ENV = 'development';
    expect(requireProductionSecret('JWT_SECRET', undefined, 'dev-fallback')).toBe('dev-fallback');

    process.env.NODE_ENV = 'test';
    expect(requireProductionSecret('JWT_SECRET', '', 'dev-fallback')).toBe('dev-fallback');

    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    expect(requireProductionSecret('JWT_SECRET', null, 'dev-fallback')).toBe('dev-fallback');
  });

  it('throws with a structured error when running in production and the value is missing', () => {
    process.env.NODE_ENV = 'production';

    expect(() => requireProductionSecret('JWT_SECRET', undefined, 'dev-fallback')).toThrowError(
      /JWT_SECRET must be set when NODE_ENV=production/,
    );

    try {
      requireProductionSecret('COOKIE_SECRET', '', 'dev-cookie-secret-change-me');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(500);
      expect((error as { code?: string }).code).toBe('COOKIE_SECRET_REQUIRED');
    }
  });

  it('throws when caller explicitly passes the dev fallback string in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => requireProductionSecret('STRIPE_SECRET_KEY', 'dev-stripe-key', 'dev-stripe-key')).toThrowError(
      /STRIPE_SECRET_KEY must be set/,
    );
  });
});
