import { describe, expect, it } from 'vitest';
import { REPORTER_SCRIPT } from './reporter-script.js';

/*
 * The reporter is a static <script> string injected into remote previews, so we
 * exercise it the way the browser does: build a minimal DOM/host shim, evaluate
 * the IIFE against it, then drive events + a controllable clock and assert the
 * observable behaviour (postMessage payloads + the in-frame blank overlay).
 */

interface FakeNode {
  tagName: string;
  id: string;
  type?: string;
  style: { cssText: string };
  children: FakeNode[];
  textContent: string;
  attrs: Record<string, string>;
  listeners: Record<string, Array<(event: unknown) => void>>;
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeNode): FakeNode;
  addEventListener(name: string, handler: (event: unknown) => void): void;
  get innerText(): string;
}

function makeNode(tagName: string): FakeNode {
  return {
    tagName,
    id: '',
    style: { cssText: '' },
    children: [],
    textContent: '',
    attrs: {},
    listeners: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(name, handler) {
      (this.listeners[name] ||= []).push(handler);
    },
    get innerText() {
      const own = this.textContent || '';
      const nested = this.children.map((c) => c.innerText).join('');
      return own + nested;
    },
  };
}

type Harness = {
  run(): void;
  dispatchError(message: string): void;
  tick(ms: number): void;
  posted: Array<{ type: string; message?: string }>;
  beacons: string[];
  root: FakeNode;
  body: FakeNode;
  overlay(): FakeNode | undefined;
};

function makeHarness(): Harness {
  const posted: Array<{ type: string; message?: string }> = [];
  const beacons: string[] = [];

  const root = makeNode('div');
  root.id = 'root';
  const body = makeNode('body');

  const byId: Record<string, FakeNode> = { root };

  const timers: Array<{ at: number; fn: () => void }> = [];
  let now = 0;

  const windowListeners: Record<string, Array<(event: unknown) => void>> = {};

  const win: Record<string, unknown> = {
    __vibecorePreviewReporterInstalled: undefined,
    addEventListener(name: string, handler: (event: unknown) => void) {
      (windowListeners[name] ||= []).push(handler);
    },
    parent: {
      postMessage(payload: { type: string; message?: string }) {
        posted.push(payload);
      },
    },
  };

  const documentShim = {
    body,
    getElementById(id: string) {
      // overlay is looked up by id once appended to body
      if (byId[id]) {
        return byId[id];
      }
      const found = body.children.find((c) => c.id === id);
      return found ?? null;
    },
    createElement(tag: string) {
      return makeNode(tag);
    },
  };
  // record overlay appends so getElementById(OVERLAY_ID) works after render
  const originalAppend = body.appendChild.bind(body);
  body.appendChild = (child: FakeNode) => {
    if (child.id) {
      byId[child.id] = child;
    }
    return originalAppend(child);
  };

  const navigatorShim = {
    sendBeacon(_url: string, data: string) {
      beacons.push(data);
      return true;
    },
  };

  const consoleShim = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  const locationShim = { href: 'https://preview.example/', reload() {} };

  const setTimeoutShim = (fn: () => void, delay: number) => {
    timers.push({ at: now + (delay || 0), fn });
    return timers.length;
  };

  const DateShim = { now: () => now };

  return {
    run() {
      // Evaluate the IIFE with host globals shadowed as params (matches browser scope).
      const factory = new Function(
        'window',
        'document',
        'navigator',
        'console',
        'location',
        'setTimeout',
        'Date',
        REPORTER_SCRIPT,
      );
      factory(win, documentShim, navigatorShim, consoleShim, locationShim, setTimeoutShim, DateShim);
    },
    dispatchError(message: string) {
      for (const handler of windowListeners.error ?? []) {
        handler({ message, error: { message, stack: message } });
      }
    },
    tick(ms: number) {
      now += ms;
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
      for (const t of due) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
    posted,
    beacons,
    root,
    body,
    overlay() {
      return body.children.find((c) => c.id === '__vibecorePreviewBlankOverlay');
    },
  };
}

describe('preview reporter blank-overlay fail-safe', () => {
  it('renders a visible overlay naming the load-time error when the app never mounts', () => {
    const h = makeHarness();
    h.run();

    // App threw at module-eval (e.g. a stray "Cannot redefine property: process")
    // and #root stayed empty.
    h.dispatchError('Cannot redefine property: process');

    // Before the grace window elapses, nothing is drawn (a slow mount may recover).
    expect(h.overlay()).toBeUndefined();

    h.tick(1500);

    const overlay = h.overlay();
    expect(overlay).toBeDefined();
    expect(overlay?.innerText).toContain('This preview failed to load');
    // The real cause is surfaced verbatim, not a generic message.
    expect(overlay?.innerText).toContain('Cannot redefine property: process');

    // And it is reported promptly (well before the 18s silent-blank watchdog).
    const blank = h.posted.find((p) => p.type === 'PREVIEW_BLANK');
    expect(blank).toBeDefined();
    expect(blank?.message).toContain('Cannot redefine property: process');
    expect(h.beacons.length).toBe(1);
  });

  it('never draws the overlay when the app actually rendered (no false positive)', () => {
    const h = makeHarness();
    h.run();

    // App mounted: #root has content.
    h.root.appendChild(makeNode('main'));

    // A non-fatal uncaught error still fires, but the app is healthy.
    h.dispatchError('some async error');
    h.tick(20000); // advance past both the 1.5s and the 10s+8s watchdogs

    expect(h.overlay()).toBeUndefined();
    expect(h.posted.find((p) => p.type === 'PREVIEW_BLANK')).toBeUndefined();
  });

  it('reports and overlays at most once', () => {
    const h = makeHarness();
    h.run();

    h.dispatchError('boom');
    h.tick(1500);
    h.dispatchError('boom again');
    h.tick(20000);

    expect(h.posted.filter((p) => p.type === 'PREVIEW_BLANK').length).toBe(1);
    expect(h.body.children.filter((c) => c.id === '__vibecorePreviewBlankOverlay').length).toBe(1);
  });

  it('still forwards PREVIEW_ERROR with the original payload shape', () => {
    const h = makeHarness();
    h.run();
    h.dispatchError('Cannot redefine property: process');

    const err = h.posted.find((p) => p.type === 'PREVIEW_ERROR');
    expect(err).toBeDefined();
    expect(err?.message).toBe('Cannot redefine property: process');
  });
});
