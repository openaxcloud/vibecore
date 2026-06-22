/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConsolePayload, formatConsoleMessage, serializeConsoleArg } from './preview-reporter-format';

describe('serializeConsoleArg', () => {
  it('passes strings through unchanged', () => {
    expect(serializeConsoleArg('hello')).toBe('hello');
  });

  it('stringifies primitives', () => {
    expect(serializeConsoleArg(42)).toBe('42');
    expect(serializeConsoleArg(true)).toBe('true');
    expect(serializeConsoleArg(undefined)).toBe('undefined');
    expect(serializeConsoleArg(null)).toBe('null');
  });

  it('JSON-encodes plain objects', () => {
    expect(serializeConsoleArg({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
  });

  it('keeps Error stacks', () => {
    const error = new Error('boom');
    expect(serializeConsoleArg(error)).toContain('boom');
  });

  it('survives circular references without throwing', () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;

    const result = serializeConsoleArg(circular);
    expect(result).toContain('[Circular]');
  });
});

describe('formatConsoleMessage', () => {
  it('joins multiple args with a space, like the browser console', () => {
    expect(formatConsoleMessage(['count', 3, { ok: true }])).toBe('count 3 {"ok":true}');
  });

  it('truncates very long output', () => {
    const huge = 'x'.repeat(20000);
    const result = formatConsoleMessage([huge]);
    expect(result.length).toBeLessThan(huge.length);
    expect(result.endsWith('… (truncated)')).toBe(true);
  });
});

describe('buildConsolePayload', () => {
  it('produces a PREVIEW_CONSOLE payload with level + message', () => {
    const payload = buildConsolePayload('warn', ['hi', 1], 123);
    expect(payload).toEqual({
      type: 'PREVIEW_CONSOLE',
      level: 'warn',
      message: 'hi 1',
      ts: 123,
    });
  });
});

/*
 * Regression test for the actual shipped reporter IIFE: loading it must wrap
 * console.* and forward each call to the parent as a PREVIEW_CONSOLE message.
 * Before the fix the reporter only forwarded 'error'/'unhandledrejection', so
 * the IDE Console tab could never show ordinary app console output.
 */
describe('vibecore-preview-reporter.js (console capture)', () => {
  const reporterSource = readFileSync(join(__dirname, 'vibecore-preview-reporter.js'), 'utf8');

  let posted: unknown[];

  beforeEach(() => {
    posted = [];
    delete (window as unknown as { __vibecorePreviewReporterInstalled?: boolean }).__vibecorePreviewReporterInstalled;
    vi.spyOn(window.parent, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message);
    });

    new Function(reporterSource)();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards console.log as a PREVIEW_CONSOLE message', () => {
    console.log('hello', 123);

    const consoleEvents = posted.filter(
      (message): message is { type: string; level: string; message: string } =>
        typeof message === 'object' && message !== null && (message as { type?: string }).type === 'PREVIEW_CONSOLE',
    );
    expect(consoleEvents.length).toBe(1);
    expect(consoleEvents[0].level).toBe('log');
    expect(consoleEvents[0].message).toBe('hello 123');
  });

  it('forwards console.warn and console.error with the right level', () => {
    console.warn('careful');

    console.error('broke');

    const levels = posted
      .filter(
        (message): message is { type: string; level: string } =>
          typeof message === 'object' && message !== null && (message as { type?: string }).type === 'PREVIEW_CONSOLE',
      )
      .map((event) => event.level);
    expect(levels).toContain('warn');
    expect(levels).toContain('error');
  });
});
