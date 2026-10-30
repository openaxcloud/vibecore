// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { REPORTER_SCRIPT } from './reporter-script.js';

const publicReporter = readFileSync('../../public/vibecore-preview-reporter.js', 'utf8');

let posted: ReturnType<typeof vi.spyOn>;
let beacon: ReturnType<typeof vi.fn>;

const observers: MutationObserver[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="root"></div>';
  delete (window as unknown as Record<string, unknown>).__vibecorePreviewReporterInstalled;
  posted = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
});
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.disconnect());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function install(script: string) {
  class Observer extends MutationObserver {
    constructor(callback: MutationCallback) {
      super(callback);
      observers.push(this);
    }
  }
  new Function('window', 'document', 'navigator', 'MutationObserver', 'location', 'console', 'setTimeout', script)(
    window,
    document,
    navigator,
    Observer,
    window.location,
    { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    setTimeout,
  );
}

function events() {
  return posted.mock.calls.map(([payload]) => payload).filter((payload) => payload.type === 'PREVIEW_ERROR');
}

it.each([
  ['remote', REPORTER_SCRIPT],
  ['local', publicReporter],
])(
  '%s reporter observes compilation overlays, deduplicates while present and rearms after removal',
  async (_name, script) => {
    install(script);
    expect(events()).toEqual([]);

    const overlay = document.createElement('vite-error-overlay');
    overlay.attachShadow({ mode: 'open' }).innerHTML = '<pre>secret synthetic path and source</pre>';
    document.body.appendChild(overlay);
    await Promise.resolve();
    expect(events()).toEqual([
      { type: 'PREVIEW_ERROR', source: 'vite', message: 'Preview compilation failed', ts: expect.any(Number) },
    ]);
    document.body.appendChild(document.createElement('span'));
    await Promise.resolve();
    expect(events()).toHaveLength(1);
    overlay.remove();
    await Promise.resolve();
    document.body.appendChild(overlay);
    await Promise.resolve();
    expect(events()).toHaveLength(2);
    expect(JSON.stringify(events())).not.toContain('secret');

    if (_name === 'remote') {
      expect(beacon).toHaveBeenCalledWith('/__vibecore/preview-blank', expect.stringContaining('"status":"error"'));
      expect(JSON.stringify(beacon.mock.calls)).not.toContain('secret');
    }
  },
);

it('detects an existing Vite overlay even when application content is already mounted', () => {
  document.getElementById('root')!.textContent = 'Previously working app';
  document.body.appendChild(document.createElement('vite-error-overlay'));
  install(REPORTER_SCRIPT);
  expect(events()).toHaveLength(1);
  expect(document.getElementById('__vibecorePreviewBlankOverlay')).toBeNull();
});
