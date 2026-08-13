import { describe, expect, it } from 'vitest';
import {
  parseLegacyPreviewBlankMessage,
  parsePreviewDocumentHello,
  parsePreviewLifecycleMessage,
  shouldPreviewHandleInspectorMessage,
} from './Preview';

/*
 * Bug: INSPECTOR_CLICK was handled twice — once by the Inspector component
 * (which applies offsetRect() to translate the iframe-local rect into page
 * coordinates) and once by Preview's own postMessage handler (which stored the
 * raw, un-offset rect and ran the selection side-effects again). Whichever fired
 * last won, so the stored element frequently carried un-offset coordinates and
 * setSelectedElement was invoked twice per click.
 *
 * Fix: the Inspector component is the single source of truth for inspector
 * selection/hover events. Preview's own handler must skip them. This predicate
 * encodes that ownership and gates the handler's early return.
 */
describe('shouldPreviewHandleInspectorMessage', () => {
  it('does NOT handle inspector-selection events owned by the Inspector component', () => {
    // These carry rects the Inspector translates into page coordinates.
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_CLICK')).toBe(false);
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_HOVER')).toBe(false);
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_LEAVE')).toBe(false);
  });

  it('still handles INSPECTOR_READY (the activation handshake Preview owns)', () => {
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_READY')).toBe(true);
  });

  it('still handles non-inspector preview messages', () => {
    expect(shouldPreviewHandleInspectorMessage('PREVIEW_ERROR')).toBe(true);
    expect(shouldPreviewHandleInspectorMessage('PREVIEW_UNHANDLED_REJECTION')).toBe(true);
  });

  it('ignores non-string / malformed message types without throwing', () => {
    expect(shouldPreviewHandleInspectorMessage(undefined)).toBe(false);
    expect(shouldPreviewHandleInspectorMessage(null)).toBe(false);
    expect(shouldPreviewHandleInspectorMessage(42)).toBe(false);
    expect(shouldPreviewHandleInspectorMessage({})).toBe(false);
  });
});

describe('parsePreviewLifecycleMessage', () => {
  const contentWindow = {} as Window;
  const iframe = { contentWindow, src: 'https://workspace-5173.preview.test/dashboard' } as HTMLIFrameElement;

  const data = {
    type: 'PREVIEW_OK',
    documentId: 'document-current',
    epoch: 'parent-epoch',
    url: 'https://workspace-5173.preview.test/dashboard',
    ts: 123,
  };

  it('accepts the exact iframe source, origin, URL, and structured payload', () => {
    expect(
      parsePreviewLifecycleMessage(
        { data, source: contentWindow, origin: 'https://workspace-5173.preview.test' } as MessageEvent,
        iframe,
        'parent-epoch',
      ),
    ).toEqual(data);
  });

  it.each([
    ['wrong source', { data, source: {} as Window, origin: 'https://workspace-5173.preview.test' }, iframe],
    ['wrong origin', { data, source: contentWindow, origin: 'https://evil.test' }, iframe],
    [
      'wrong URL origin',
      { data: { ...data, url: 'https://evil.test/' }, source: contentWindow, origin: 'https://evil.test' },
      iframe,
    ],
    [
      'about:blank frame',
      { data, source: contentWindow, origin: 'https://workspace-5173.preview.test' },
      { ...iframe, src: 'about:blank' },
    ],
  ])('rejects %s', (_case, event, targetIframe) => {
    expect(
      parsePreviewLifecycleMessage(event as MessageEvent, targetIframe as HTMLIFrameElement, 'parent-epoch'),
    ).toBeUndefined();
  });

  it('rejects a message carrying a previous parent navigation epoch', () => {
    expect(
      parsePreviewLifecycleMessage(
        { data: { ...data, epoch: 'old-epoch' }, source: contentWindow, origin: data.url } as MessageEvent,
        iframe,
        'new-epoch',
      ),
    ).toBeUndefined();
  });

  it('accepts an SPA redirect path on the same validated preview origin', () => {
    expect(
      parsePreviewLifecycleMessage(
        {
          data: { ...data, url: 'https://workspace-5173.preview.test/auth/callback' },
          source: contentWindow,
          origin: 'https://workspace-5173.preview.test',
        } as MessageEvent,
        iframe,
        'parent-epoch',
      ),
    ).toBeDefined();
  });

  it('accepts only the empty-epoch DOCUMENT as a hello', () => {
    const hello = { ...data, type: 'PREVIEW_DOCUMENT', epoch: '' };
    expect(
      parsePreviewDocumentHello(
        { data: hello, source: contentWindow, origin: 'https://workspace-5173.preview.test' } as MessageEvent,
        iframe,
      ),
    ).toEqual({ documentId: data.documentId, url: data.url });
    expect(
      parsePreviewDocumentHello(
        { data: { ...hello, epoch: 'stale' }, source: contentWindow, origin: data.url } as MessageEvent,
        iframe,
      ),
    ).toBeUndefined();
  });

  it('accepts a hello from a real MessageEvent whose source and origin are non-enumerable', () => {
    const hello = { ...data, type: 'PREVIEW_DOCUMENT', epoch: '' };

    const event = Object.defineProperties(
      { data: hello },
      {
        source: { value: contentWindow, enumerable: false },
        origin: { value: 'https://workspace-5173.preview.test', enumerable: false },
      },
    ) as MessageEvent;

    expect(Object.keys(event)).toEqual(['data']);
    expect(parsePreviewDocumentHello(event, iframe)).toEqual({ documentId: data.documentId, url: data.url });
  });

  it('accepts a recent exact legacy BLANK only from the current frame and origin', () => {
    const now = 10_000;
    const legacy = { type: 'PREVIEW_BLANK', message: 'blank', url: data.url, ts: now - 1 };
    expect(
      parseLegacyPreviewBlankMessage(
        { data: legacy, source: contentWindow, origin: 'https://workspace-5173.preview.test' } as MessageEvent,
        iframe,
        now,
      ),
    ).toEqual(legacy);
    expect(
      parseLegacyPreviewBlankMessage(
        { data: { ...legacy, epoch: '' }, source: contentWindow, origin: data.url } as MessageEvent,
        iframe,
        now,
      ),
    ).toBeUndefined();
    expect(
      parseLegacyPreviewBlankMessage(
        { data: { ...legacy, ts: now - 60_001 }, source: contentWindow, origin: data.url } as MessageEvent,
        iframe,
        now,
      ),
    ).toBeUndefined();
    expect(
      parseLegacyPreviewBlankMessage(
        { data: legacy, source: {} as Window, origin: data.url } as MessageEvent,
        iframe,
        now,
      ),
    ).toBeUndefined();
  });
});
