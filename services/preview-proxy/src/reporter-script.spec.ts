import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPORTER_SCRIPT } from './reporter-script.js';

const PUBLIC_REPORTER_SCRIPT = readFileSync(
  new URL('../../../public/vibecore-preview-reporter.js', import.meta.url),
  'utf8',
);

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
  rel?: string;
  href?: string;
  src?: string;
  media?: string;
  disabled?: boolean;
  sheet?: unknown | null;
  complete?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
  style: { cssText: string };
  computedStyle: {
    display: string;
    visibility: string;
    opacity: string;
    position: string;
    overflow: string;
    overflowX: string;
    overflowY: string;
    transform: string;
    perspective: string;
    filter: string;
    backdropFilter: string;
    contain: string;
    willChange: string;
    color: string;
    webkitTextFillColor: string;
    clipPath: string;
    maskImage: string;
    webkitMaskImage: string;
    backgroundClip: string;
    webkitBackgroundClip: string;
    backgroundImage: string;
    backgroundColor: string;
    boxShadow: string;
    borderTopWidth: string;
    borderRightWidth: string;
    borderBottomWidth: string;
    borderLeftWidth: string;
    borderTopStyle: string;
    borderRightStyle: string;
    borderBottomStyle: string;
    borderLeftStyle: string;
    borderTopColor: string;
    borderRightColor: string;
    borderBottomColor: string;
    borderLeftColor: string;
    clip: string;
    content: string;
    left: string;
    right: string;
    top: string;
    bottom: string;
    width: string;
    height: string;
  };
  children: FakeNode[];
  textContent: string;
  textRect?: { width: number; height: number; x?: number; y?: number };
  readonly childNodes: Array<{ nodeType: 3; textContent: string; owner: FakeNode }>;
  attrs: Record<string, string>;
  listeners: Record<string, Array<(event: unknown) => void>>;
  parentNode: FakeNode | null;
  rect: { width: number; height: number; x?: number; y?: number };
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeNode): FakeNode;
  addEventListener(name: string, handler: (event: unknown) => void): void;
  get innerText(): string;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(selector: string): FakeNode[];
  closest(selector: string): FakeNode | null;
  getBoundingClientRect(): {
    width: number;
    height: number;
    x: number;
    y: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  getContext?(kind: string): {
    drawImage?(): void;
    getImageData(): { data: Uint8ClampedArray };
  } | null;
  getAttribute?(name: string): string | null;
  remove(): void;
  notifyMutation(): void;
  setMutationNotifier(notifier: () => void): void;
}

function nodeMatchesSelector(node: FakeNode, selector: string): boolean {
  if (selector === '*') {
    return true;
  }

  const tag = node.tagName.toLowerCase();

  if (selector === 'link[rel~="stylesheet"]') {
    return (
      tag === 'link' &&
      String(node.rel ?? '')
        .split(/\s+/)
        .includes('stylesheet')
    );
  }

  if (tag === 'img') {
    return Boolean(node.src || node.attrs.src);
  }

  if (['canvas', 'video', 'svg', 'input', 'button', 'textarea', 'select'].includes(tag)) {
    return true;
  }

  return node.attrs.role === 'img';
}

function makeNode(tagName: string): FakeNode {
  let mutationNotifier = () => undefined;

  const node: FakeNode = {
    tagName,
    id: '',
    style: { cssText: '' },
    computedStyle: {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
      transform: 'none',
      perspective: 'none',
      filter: 'none',
      backdropFilter: 'none',
      contain: 'none',
      willChange: 'auto',
      color: 'rgb(0, 0, 0)',
      webkitTextFillColor: '',
      clipPath: 'none',
      maskImage: 'none',
      webkitMaskImage: 'none',
      backgroundClip: 'border-box',
      webkitBackgroundClip: 'border-box',
      backgroundImage: 'none',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      boxShadow: 'none',
      borderTopWidth: '0px',
      borderRightWidth: '0px',
      borderBottomWidth: '0px',
      borderLeftWidth: '0px',
      borderTopStyle: 'none',
      borderRightStyle: 'none',
      borderBottomStyle: 'none',
      borderLeftStyle: 'none',
      borderTopColor: 'rgba(0, 0, 0, 0)',
      borderRightColor: 'rgba(0, 0, 0, 0)',
      borderBottomColor: 'rgba(0, 0, 0, 0)',
      borderLeftColor: 'rgba(0, 0, 0, 0)',
      clip: 'auto',
      content: 'none',
      left: 'auto',
      right: 'auto',
      top: 'auto',
      bottom: 'auto',
      width: 'auto',
      height: 'auto',
    },
    children: [],
    textContent: '',
    attrs: {},
    listeners: {},
    parentNode: null,
    rect: { width: 20, height: 20 },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;

      if (name === 'id') {
        this.id = value;
      }

      if (name === 'src') {
        this.src = value;
      }

      if (name === 'href') {
        this.href = value;
      }

      if (name === 'rel') {
        this.rel = value;
      }

      mutationNotifier();
    },
    appendChild(child) {
      child.parentNode = this;
      child.setMutationNotifier(mutationNotifier);
      this.children.push(child);
      mutationNotifier();

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
    get childNodes() {
      return this.textContent ? [{ nodeType: 3 as const, textContent: this.textContent, owner: this }] : [];
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      const matches: FakeNode[] = [];

      const visit = (candidate: FakeNode) => {
        if (nodeMatchesSelector(candidate, selector)) {
          matches.push(candidate);
        }

        candidate.children.forEach(visit);
      };
      this.children.forEach(visit);

      return matches;
    },
    closest(selector) {
      if (!selector.startsWith('#')) {
        return null;
      }

      const id = selector.slice(1);

      let current: FakeNode | null = this;

      while (current) {
        if (current.id === id) {
          return current;
        }

        current = current.parentNode;
      }

      return null;
    },
    getBoundingClientRect() {
      const x = this.rect.x ?? 0;
      const y = this.rect.y ?? 0;

      return {
        ...this.rect,
        x,
        y,
        left: x,
        top: y,
        right: x + this.rect.width,
        bottom: y + this.rect.height,
      };
    },
    remove() {
      const parent = this.parentNode;

      if (!parent) {
        return;
      }

      const index = parent.children.indexOf(this);

      if (index >= 0) {
        parent.children.splice(index, 1);
      }

      this.parentNode = null;
      mutationNotifier();
    },
    notifyMutation() {
      mutationNotifier();
    },
    setMutationNotifier(notifier) {
      mutationNotifier = notifier;
      this.children.forEach((child) => child.setMutationNotifier(notifier));
    },
  };

  if (tagName.toLowerCase() === 'canvas') {
    node.width = 300;
    node.height = 150;
    node.getContext = () => ({
      drawImage(source?: FakeNode) {
        if (source?.attrs['data-painted'] === 'true') {
          node.attrs['data-painted'] = 'true';
        }
      },
      getImageData() {
        const data = new Uint8ClampedArray(4);
        data[3] = node.attrs['data-painted'] === 'true' ? 255 : 0;

        return { data };
      },
    });
  }

  return node;
}

interface PostedPayload {
  type: string;
  message?: string;
  documentId?: string;
  epoch?: string;
  url?: string;
  ts?: number;
}

interface HarnessOptions {
  bodyInitiallyAvailable?: boolean;
  withRoot?: boolean;
}

type Harness = {
  run(): void;
  dispatchError(message: string): void;
  dispatchAssetError(target: FakeNode): void;
  dispatchDOMContentLoaded(): void;
  dispatchEpoch(epoch: string): void;
  revealBody(): void;
  notifyMutation(): void;
  notifyAttributeMutation(): void;
  tick(ms: number): void;
  posted: PostedPayload[];
  beacons: string[];
  root: FakeNode;
  body: FakeNode;
  overlay(): FakeNode | undefined;
};

function makeHarness(options: HarnessOptions = {}, reporterScript = REPORTER_SCRIPT): Harness {
  const posted: PostedPayload[] = [];
  const beacons: string[] = [];

  const root = makeNode('div');
  root.id = 'root';

  const body = makeNode('body');
  const withRoot = options.withRoot ?? true;

  let bodyAvailable = options.bodyInitiallyAvailable ?? true;

  if (withRoot) {
    body.appendChild(root);
  }

  const timers: Array<{ at: number; fn: () => void }> = [];

  let now = 0;

  const windowListeners: Record<
    string,
    Array<{ capture: boolean; handler: (event: unknown) => void; once: boolean }>
  > = {};

  const mutationObservers: Array<{ callback: () => void; options?: Record<string, unknown> }> = [];

  const notifyMutation = () => {
    for (const observer of [...mutationObservers]) {
      observer.callback();
    }
  };
  body.setMutationNotifier(notifyMutation);

  const parentWindow = {
    postMessage(payload: PostedPayload) {
      posted.push(payload);
    },
  };

  const dispatchWindowEvent = (name: string, event: unknown) => {
    const entries = [...(windowListeners[name] ?? [])].sort(
      (left, right) => Number(right.capture) - Number(left.capture),
    );

    for (const entry of entries) {
      entry.handler(event);

      if (entry.once) {
        const index = windowListeners[name]?.indexOf(entry) ?? -1;

        if (index >= 0) {
          windowListeners[name].splice(index, 1);
        }
      }
    }
  };

  const win: Record<string, unknown> = {
    __vibecorePreviewReporterInstalled: undefined,
    addEventListener(
      name: string,
      handler: (event: unknown) => void,
      optionsOrCapture?: boolean | { capture?: boolean; once?: boolean },
    ) {
      const capture = typeof optionsOrCapture === 'boolean' ? optionsOrCapture : Boolean(optionsOrCapture?.capture);
      const once = typeof optionsOrCapture === 'object' && Boolean(optionsOrCapture.once);
      (windowListeners[name] ||= []).push({ capture, handler, once });
    },
    parent: parentWindow,
    innerWidth: 1280,
    innerHeight: 720,
    getComputedStyle(element: FakeNode, pseudo?: string) {
      if (pseudo && (pseudo === '::before' || pseudo === '::after')) {
        const pseudoStyle = element.attrs[`${pseudo}:style`]
          ? (JSON.parse(element.attrs[`${pseudo}:style`]) as Partial<FakeNode['computedStyle']>)
          : {};
        return { ...element.computedStyle, ...pseudoStyle, content: element.attrs[pseudo] ?? 'none' };
      }

      return element.computedStyle;
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the browser constructor name.
    MutationObserver: function MutationObserver(callback: () => void) {
      return {
        observe(_target: unknown, observerOptions?: Record<string, unknown>) {
          mutationObservers.push({ callback, options: observerOptions });
        },
      };
    },
    matchMedia: () => ({ matches: true }),
  };

  const documentShim = {
    get body() {
      return bodyAvailable ? body : null;
    },
    readyState: 'loading',
    getElementById(id: string) {
      if (!bodyAvailable) {
        return null;
      }

      const visit = (candidate: FakeNode): FakeNode | null => {
        if (candidate.id === id) {
          return candidate;
        }

        for (const child of candidate.children) {
          const found = visit(child);

          if (found) {
            return found;
          }
        }

        return null;
      };

      return visit(body);
    },
    createElement(tag: string) {
      return makeNode(tag);
    },
    createRange() {
      let selected: { owner: FakeNode } | undefined;
      return {
        selectNodeContents(node: { owner: FakeNode }) {
          selected = node;
        },
        getClientRects() {
          if (!selected) {
            return [];
          }

          const rect = selected.owner.textRect ?? selected.owner.rect;
          const x = rect.x ?? 0;
          const y = rect.y ?? 0;

          return [
            {
              ...rect,
              x,
              y,
              left: x,
              top: y,
              right: x + rect.width,
              bottom: y + rect.height,
            },
          ];
        },
      };
    },
    querySelectorAll(selector: string) {
      return bodyAvailable ? body.querySelectorAll(selector) : [];
    },
  };

  const navigatorShim = {
    sendBeacon(_url: string, data: string) {
      beacons.push(data);
      return true;
    },
  };

  const consoleShim = {
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };

  const locationShim = { href: 'https://preview.example/', reload: () => undefined };

  const setTimeoutShim = (fn: () => void, delay: number) => {
    timers.push({ at: now + (delay || 0), fn });
    return timers.length;
  };

  const dateShim = { now: () => now };

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
        reporterScript,
      );
      factory(win, documentShim, navigatorShim, consoleShim, locationShim, setTimeoutShim, dateShim);
    },
    dispatchError(message: string) {
      dispatchWindowEvent('error', { message, error: { message, stack: message }, target: win });
    },
    dispatchAssetError(target: FakeNode) {
      dispatchWindowEvent('error', { target });
    },
    dispatchDOMContentLoaded() {
      dispatchWindowEvent('DOMContentLoaded', { target: documentShim });
    },
    dispatchEpoch(epoch: string) {
      dispatchWindowEvent('message', {
        data: { type: 'PREVIEW_EPOCH', epoch },
        source: parentWindow,
      });
    },
    revealBody() {
      bodyAvailable = true;
    },
    notifyMutation,
    notifyAttributeMutation() {
      for (const observer of [...mutationObservers]) {
        if (observer.options?.attributes) {
          observer.callback();
        }
      }
    },
    tick(ms: number) {
      const targetTime = now + ms;

      let next = timers.filter((timer) => timer.at <= targetTime).sort((left, right) => left.at - right.at)[0];

      while (next) {
        now = next.at;
        timers.splice(timers.indexOf(next), 1);
        next.fn();
        next = timers.filter((timer) => timer.at <= targetTime).sort((left, right) => left.at - right.at)[0];
      }
      now = targetTime;
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

function beaconStatuses(harness: Harness): string[] {
  return harness.beacons.map((body) => JSON.parse(body) as { status: string }).map(({ status }) => status);
}

describe('preview reporter blank-overlay fail-safe', () => {
  it('renders a visible overlay naming the load-time error when the app never mounts', () => {
    const h = makeHarness();
    h.run();

    /*
     * App threw at module-eval (e.g. a stray "Cannot redefine property: process")
     * and #root stayed empty.
     */
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
    const main = makeNode('main');
    main.textContent = 'Rendered application';
    h.root.appendChild(main);

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

  it('emits MOUNTED then OK only after substantive content stays stable', () => {
    const h = makeHarness();
    h.run();

    const main = makeNode('main');
    main.textContent = 'PeopleOps dashboard';
    h.root.appendChild(main);

    h.tick(250);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(true);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    h.tick(750);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
    expect(h.beacons).toHaveLength(0);
  });

  it('installs before body exists, then observes the app after DOMContentLoaded', () => {
    const h = makeHarness({ bodyInitiallyAvailable: false });
    const main = makeNode('main');
    main.textContent = 'App mounted after the parser created body';
    h.root.appendChild(main);

    h.run();
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);

    h.revealBody();
    h.dispatchDOMContentLoaded();

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(true);
    h.tick(749);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    h.tick(1);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it('accepts substantive static body text without a SPA root', () => {
    const h = makeHarness({ withRoot: false });
    h.body.textContent = 'Static documentation rendered by the server';

    h.run();

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(true);
    h.tick(750);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
    expect(h.beacons).toHaveLength(0);
  });

  it('accepts a tiny but visible interactive control as substantive content', () => {
    const h = makeHarness();
    h.run();

    const button = makeNode('button');
    button.rect = { width: 1, height: 1 };

    h.root.appendChild(button);
    h.tick(750);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(true);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it('does not accept hidden-only visual content as a healthy preview', () => {
    const h = makeHarness();
    h.run();

    const hiddenImage = makeNode('img');
    hiddenImage.src = '/hidden-project.webp';
    hiddenImage.rect = { width: 0, height: 0 };

    h.root.appendChild(hiddenImage);
    h.tick(3000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    expect(beaconStatuses(h)).not.toContain('ok');
  });

  it('reports BLANK for an empty root after the bounded watchdog', () => {
    const h = makeHarness();
    h.run();

    h.tick(18000);

    expect(h.posted.filter((payload) => payload.type === 'PREVIEW_BLANK')).toHaveLength(1);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    expect(h.overlay()).toBeDefined();
    expect(beaconStatuses(h)).toContain('blank');
  });

  it('does not report an initial cold-boot blank at the post-OK reblank deadline', () => {
    const h = makeHarness();
    h.run();
    h.tick(1650);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_BLANK')).toBe(false);
  });

  it('reports at the final deadline when a short late mount never reaches stable OK', () => {
    const h = makeHarness();
    h.run();
    h.tick(9900);

    const transient = makeNode('main');
    transient.textContent = 'Transient frame';
    h.root.appendChild(transient);
    h.tick(500);
    transient.remove();
    h.tick(7600);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    expect(h.posted.filter((payload) => payload.type === 'PREVIEW_BLANK')).toHaveLength(1);
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter observes a CSS-only reveal after the bounded polling horizon', (_name, reporterScript) => {
    const h = makeHarness({}, reporterScript);
    const main = makeNode('main');
    main.textContent = 'Mounted but hidden';
    main.computedStyle.display = 'none';
    h.root.appendChild(main);
    h.run();
    h.tick(10500);

    main.computedStyle.display = 'block';
    h.notifyAttributeMutation();
    h.tick(750);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it('does not postpone OK while substantive DOM mutations continue', () => {
    const h = makeHarness();
    h.run();

    const main = makeNode('main');
    main.textContent = 'First stable frame';
    h.root.appendChild(main);

    h.tick(200);
    main.textContent = 'Second stable frame';
    h.notifyMutation();
    h.tick(200);
    main.textContent = 'Third stable frame';
    h.notifyMutation();
    h.tick(200);
    main.textContent = 'Fourth stable frame';
    h.notifyMutation();
    h.tick(149);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    h.tick(1);
    expect(h.posted.filter((payload) => payload.type === 'PREVIEW_OK')).toHaveLength(1);
  });

  it('does not treat its own blank overlay as a healthy mount', () => {
    const h = makeHarness();
    h.run();
    h.dispatchError('boom');
    h.tick(1500);
    h.tick(1000);

    expect(h.overlay()).toBeDefined();
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    expect(beaconStatuses(h)).not.toContain('ok');
  });

  it('reports BLANK when a previously healthy app unmounts and stays empty', () => {
    const h = makeHarness();
    h.run();

    const main = makeNode('main');
    main.textContent = 'Initially healthy app';
    h.root.appendChild(main);
    h.tick(750);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);

    main.remove();
    h.tick(1499);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_BLANK')).toBe(false);
    h.tick(1);

    expect(h.posted.filter((payload) => payload.type === 'PREVIEW_BLANK')).toHaveLength(1);
    expect(beaconStatuses(h)).toContain('blank');
  });

  it('keeps one reblank timer through repeated empty mutations', () => {
    const h = makeHarness();
    const main = makeNode('main');
    main.textContent = 'Initially healthy app';
    h.root.appendChild(main);
    h.run();
    h.tick(750);
    main.remove();
    h.notifyMutation();
    h.tick(500);
    h.notifyMutation();
    h.tick(500);
    h.notifyMutation();
    h.tick(500);
    expect(h.posted.filter((payload) => payload.type === 'PREVIEW_BLANK')).toHaveLength(1);
  });

  it('keeps an asset error separate while still proving the visible surface healthy', () => {
    const h = makeHarness();
    h.run();

    const main = makeNode('main');
    main.textContent = 'DOM rendered before its stylesheet failed';
    h.root.appendChild(main);

    const stylesheet = makeNode('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'https://preview.example/missing.css';
    h.dispatchAssetError(stylesheet);
    h.tick(750);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_ERROR')).toBe(true);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
    expect(beaconStatuses(h)).toContain('error');
    expect(beaconStatuses(h)).not.toContain('ok');
  });

  it('rejects normal-flow content fully clipped by an overflow-hidden mount', () => {
    const h = makeHarness();
    h.root.rect = { width: 800, height: 0 };
    h.root.computedStyle.overflow = 'hidden';
    h.root.computedStyle.overflowY = 'hidden';

    const main = makeNode('main');
    main.textContent = 'Clipped content';
    main.rect = { width: 800, height: 40 };
    h.root.appendChild(main);

    h.run();
    h.tick(1000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
  });

  it('accepts partially visible content and fixed content outside a zero-height mount', () => {
    const partial = makeHarness();
    partial.root.rect = { width: 800, height: 10 };
    partial.root.computedStyle.overflow = 'hidden';
    partial.root.computedStyle.overflowY = 'hidden';

    const partialMain = makeNode('main');
    partialMain.textContent = 'Partially visible';
    partialMain.rect = { width: 800, height: 40 };
    partial.root.appendChild(partialMain);
    partial.run();
    partial.tick(750);
    expect(partial.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);

    const fixed = makeHarness();
    fixed.root.rect = { width: 800, height: 0 };
    fixed.root.computedStyle.overflow = 'hidden';
    fixed.root.computedStyle.overflowY = 'hidden';

    const fixedMain = makeNode('main');
    fixedMain.textContent = 'Fixed application';
    fixedMain.computedStyle.position = 'fixed';
    fixedMain.rect = { width: 800, height: 720 };
    fixed.root.appendChild(fixedMain);
    fixed.run();
    fixed.tick(750);
    expect(fixed.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it('rejects fixed content clipped by a transformed containing block', () => {
    const h = makeHarness();
    h.root.rect = { width: 800, height: 0 };
    h.root.computedStyle.overflow = 'hidden';
    h.root.computedStyle.overflowY = 'hidden';
    h.root.computedStyle.transform = 'translateZ(0)';

    const fixedMain = makeNode('main');
    fixedMain.textContent = 'Fixed but clipped application';
    fixedMain.computedStyle.position = 'fixed';
    fixedMain.rect = { width: 800, height: 600 };
    h.root.appendChild(fixedMain);

    h.run();
    h.tick(1000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
  });

  it('does not use a visible surface box as proof for offscreen descendant text', () => {
    const h = makeHarness();
    h.root.rect = { width: 800, height: 100 };
    h.root.computedStyle.overflow = 'hidden';
    h.root.computedStyle.overflowY = 'hidden';

    const offscreen = makeNode('main');
    offscreen.textContent = 'Offscreen application';
    offscreen.rect = { width: 800, height: 40, y: 9999 };
    h.root.appendChild(offscreen);

    h.run();
    h.tick(1000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
  });

  it('rejects direct text fully clipped by its own overflow box', () => {
    const h = makeHarness();
    const clippedText = makeNode('main');
    clippedText.textContent = 'Own-box clipped text';
    clippedText.rect = { width: 50, height: 30 };
    clippedText.computedStyle.overflow = 'hidden';
    clippedText.computedStyle.overflowX = 'hidden';
    clippedText.textRect = { width: 120, height: 20, x: 100 };
    h.root.appendChild(clippedText);

    h.run();
    h.tick(1000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
  });

  it.each([
    ['color', 'transparent'],
    ['color', 'rgba(0, 0, 0, 0)'],
    ['webkitTextFillColor', 'transparent'],
  ] as const)('rejects text hidden by transparent %s', (property, value) => {
    const h = makeHarness();
    const main = makeNode('main');
    main.textContent = 'Invisible text';
    main.computedStyle[property] = value;
    h.root.appendChild(main);
    h.run();
    h.tick(1000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
  });

  it.each([
    ['clipPath', 'inset(100%)'],
    ['filter', 'opacity(0)'],
    ['maskImage', 'linear-gradient(transparent, transparent)'],
  ] as const)('rejects text hidden by %s', (property, value) => {
    const h = makeHarness();
    const main = makeNode('main');
    main.textContent = 'Invisible text';
    main.computedStyle[property] = value;
    h.root.appendChild(main);
    h.run();
    h.tick(1000);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_MOUNTED')).toBe(false);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
  });

  it('accepts transparent glyph color when a visible background is clipped to text', () => {
    const h = makeHarness();
    const main = makeNode('main');
    main.textContent = 'Gradient text';
    main.computedStyle.color = 'transparent';
    main.computedStyle.backgroundClip = 'text';
    main.computedStyle.backgroundImage = 'linear-gradient(red, blue)';
    h.root.appendChild(main);
    h.run();
    h.tick(750);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it('accepts an opaque webkit text fill over a transparent color', () => {
    const h = makeHarness();
    const main = makeNode('main');
    main.textContent = 'Red filled text';
    main.computedStyle.color = 'transparent';
    main.computedStyle.webkitTextFillColor = 'rgb(255, 0, 0)';
    h.root.appendChild(main);
    h.run();
    h.tick(750);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it('uses one document id and repeats the document handshake before lifecycle evidence', () => {
    const h = makeHarness();
    h.run();

    const main = makeNode('main');
    main.textContent = 'Healthy app';
    h.root.appendChild(main);
    h.tick(250);
    h.tick(750);

    const okIndex = h.posted.findIndex((payload) => payload.type === 'PREVIEW_OK');
    expect(okIndex).toBeGreaterThan(0);
    expect(h.posted[okIndex - 1]).toMatchObject({
      type: 'PREVIEW_DOCUMENT',
      documentId: h.posted[okIndex].documentId,
    });
  });

  it('replays DOCUMENT and the current state for a PREVIEW_EPOCH challenge', () => {
    const h = makeHarness();
    h.run();

    const main = makeNode('main');
    main.textContent = 'Healthy app awaiting the parent epoch';
    h.root.appendChild(main);
    h.tick(750);

    const initialOk = h.posted.find((payload) => payload.type === 'PREVIEW_OK');
    expect(initialOk?.documentId).toBeTruthy();
    h.posted.splice(0, h.posted.length);

    h.dispatchEpoch('preview-epoch-42');

    expect(h.posted.map((payload) => payload.type)).toEqual(['PREVIEW_DOCUMENT', 'PREVIEW_OK']);
    expect(h.posted).toEqual([
      expect.objectContaining({
        type: 'PREVIEW_DOCUMENT',
        documentId: initialOk?.documentId,
        epoch: 'preview-epoch-42',
      }),
      expect.objectContaining({
        type: 'PREVIEW_OK',
        documentId: initialOk?.documentId,
        epoch: 'preview-epoch-42',
      }),
    ]);
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter keeps visual OK separate from a failed asset', (_name, reporterScript) => {
    const h = makeHarness({}, reporterScript);
    const main = makeNode('main');
    main.textContent = 'Visible application';
    h.root.appendChild(main);
    h.run();

    const stylesheet = makeNode('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'https://preview.example/missing.css';
    h.dispatchAssetError(stylesheet);
    h.tick(750);

    expect(h.posted.some((payload) => payload.type === 'PREVIEW_ERROR')).toBe(true);
    expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);

    if (_name === 'proxy') {
      expect(beaconStatuses(h)).toContain('error');
    } else {
      expect(h.beacons).toHaveLength(0);
    }
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter rejects clipped text and accepts fixed painted content', (_name, reporterScript) => {
    const clipped = makeHarness({}, reporterScript);
    clipped.root.rect = { width: 800, height: 0 };
    clipped.root.computedStyle.overflow = 'hidden';
    clipped.root.computedStyle.overflowY = 'hidden';

    const hidden = makeNode('main');
    hidden.textContent = 'Clipped';
    hidden.rect = { width: 800, height: 40 };
    clipped.root.appendChild(hidden);
    clipped.run();
    clipped.tick(1000);
    expect(clipped.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);

    const fixed = makeHarness({}, reporterScript);
    fixed.root.rect = { width: 800, height: 0 };

    const visible = makeNode('main');
    visible.textContent = 'Fixed app';
    visible.computedStyle.position = 'fixed';
    visible.rect = { width: 800, height: 720 };
    fixed.root.appendChild(visible);
    fixed.run();
    fixed.tick(750);
    expect(fixed.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter accepts visible CSS-only app surfaces', (_name, reporterScript) => {
    for (const decorate of [
      (node: FakeNode) => {
        node.computedStyle.backgroundColor = 'rgb(220, 38, 38)';
      },
      (node: FakeNode) => {
        node.computedStyle.borderTopWidth = '4px';
        node.computedStyle.borderTopStyle = 'solid';
        node.computedStyle.borderTopColor = 'rgb(59, 130, 246)';
      },
      (node: FakeNode) => {
        node.attrs['::before'] = '"Loading"';
      },
      (node: FakeNode) => {
        node.attrs['::before'] = '""';
        node.computedStyle.backgroundColor = 'rgb(220, 38, 38)';
      },
      (node: FakeNode) => {
        node.rect = { width: 160, height: 0 };
        node.attrs['::before'] = '"Visible"';
        node.attrs['::before:style'] = JSON.stringify({
          position: 'fixed',
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px',
          backgroundColor: 'rgb(220, 38, 38)',
        });
      },
      (node: FakeNode) => {
        node.rect = { width: 160, height: 0 };
        node.attrs['::before'] = '""';
        node.attrs['::before:style'] = JSON.stringify({
          position: 'absolute',
          top: '0px',
          left: '0px',
          width: '160px',
          height: '90px',
          backgroundColor: 'rgb(220, 38, 38)',
        });
      },
    ]) {
      const h = makeHarness({}, reporterScript);
      const surface = makeNode('div');
      surface.rect = { width: 160, height: 90 };
      decorate(surface);
      h.root.appendChild(surface);
      h.run();
      h.tick(750);
      expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
    }
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter rejects visually clipped CSS-only content', (_name, reporterScript) => {
    for (const hide of [
      (node: FakeNode) => {
        node.computedStyle.clip = 'rect(0, 0, 0, 0)';
      },
      (node: FakeNode) => {
        node.computedStyle.clipPath = 'circle(0)';
      },
      (node: FakeNode) => {
        node.computedStyle.clipPath = 'ellipse(0 0)';
      },
    ]) {
      const h = makeHarness({}, reporterScript);
      const surface = makeNode('div');
      surface.computedStyle.backgroundColor = 'rgb(220, 38, 38)';
      hide(surface);
      h.root.appendChild(surface);
      h.run();
      h.tick(1000);
      expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    }
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter rejects fully transparent decoration', (_name, reporterScript) => {
    for (const hide of [
      (surface: FakeNode) => {
        surface.computedStyle.boxShadow = '0 0 20px rgba(0, 0, 0, 0)';
      },
      (surface: FakeNode) => {
        surface.rect = { width: 160, height: 0 };
        surface.attrs['::before'] = '""';
        surface.attrs['::before:style'] = JSON.stringify({
          position: 'fixed',
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px',
          backgroundColor: 'rgb(220, 38, 38)',
          transform: 'matrix(0, 0, 0, 0, 0, 0)',
        });
      },
      (surface: FakeNode) => {
        surface.rect = { width: 160, height: 0 };
        surface.attrs['::before'] = '""';
        surface.attrs['::before:style'] = JSON.stringify({
          position: 'fixed',
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px',
          backgroundColor: 'rgb(220, 38, 38)',
          clipPath: 'inset(100%)',
        });
      },
    ]) {
      const h = makeHarness({}, reporterScript);
      const surface = makeNode('div');
      hide(surface);
      h.root.appendChild(surface);
      h.run();
      h.tick(1000);
      expect(h.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);
    }
  });

  it.each([
    ['proxy', REPORTER_SCRIPT],
    ['public', PUBLIC_REPORTER_SCRIPT],
  ])('%s reporter distinguishes painted and blank canvas surfaces', (_name, reporterScript) => {
    const blank = makeHarness({}, reporterScript);
    const blankCanvas = makeNode('canvas');
    blank.root.appendChild(blankCanvas);
    blank.run();
    blank.tick(1000);
    expect(blank.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(false);

    const painted = makeHarness({}, reporterScript);
    const paintedCanvas = makeNode('canvas');
    paintedCanvas.attrs['data-painted'] = 'true';
    painted.root.appendChild(paintedCanvas);
    painted.run();
    painted.tick(750);
    expect(painted.posted.some((payload) => payload.type === 'PREVIEW_OK')).toBe(true);
  });
});
