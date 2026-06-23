import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScopedLogger, logger } from './logger';

describe('logger argument passthrough', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('passes Error objects through to console.log without stringifying them', () => {
    const error = new Error('boom');
    logger.error('Failed to X', error);

    expect(consoleSpy).toHaveBeenCalledTimes(1);

    const args = consoleSpy.mock.calls[0];

    // The actual Error instance must reach console.log, not '[object Object]'.
    expect(args).toContain(error);
    expect(args.some((a) => a === error)).toBe(true);
    expect(args.some((a) => a === '[object Object]')).toBe(false);
  });

  it('preserves the literal string message argument', () => {
    const error = new Error('boom');
    logger.error('Failed to X', error);

    const args = consoleSpy.mock.calls[0];
    expect(args).toContain('Failed to X');
  });

  it('does not throw when the first argument is a non-string object', () => {
    const obj = { foo: 'bar' };

    expect(() => logger.error(obj, 'more')).not.toThrow();

    const args = consoleSpy.mock.calls[0];
    expect(args).toContain(obj);
    expect(args).toContain('more');
  });

  it('passes multiple objects through individually', () => {
    const a = { a: 1 };
    const b = new Error('b');
    const c = ['c'];

    logger.error('msg', a, b, c);

    const args = consoleSpy.mock.calls[0];
    expect(args).toContain(a);
    expect(args).toContain(b);
    expect(args).toContain(c);
  });

  it('works with scoped loggers too', () => {
    const scoped = createScopedLogger('TestScope');
    const error = new Error('scoped boom');

    scoped.error('Failed in scope', error);

    const args = consoleSpy.mock.calls[0];
    expect(args).toContain(error);
    expect(args).toContain('Failed in scope');
  });
});
