import { describe, expect, it } from 'vitest';
import { evaluatePreviewReadyEdge, resolvePreviewAddress } from './preview-address';

const BASE = 'https://app.preview.example.com';

describe('resolvePreviewAddress', () => {
  it('treats a bare path as same-origin and persists it', () => {
    const result = resolvePreviewAddress('/dashboard', BASE);

    expect(result.crossOrigin).toBe(false);
    expect(result.iframeUrl).toBe(`${BASE}/dashboard`);
    expect(result.addressInput).toBe(`${BASE}/dashboard`);
    expect(result.displayPath).toBe('/dashboard');
  });

  it('prefixes a relative path that is missing a leading slash', () => {
    const result = resolvePreviewAddress('settings', BASE);

    expect(result.iframeUrl).toBe(`${BASE}/settings`);
    expect(result.displayPath).toBe('/settings');
  });

  it('reduces a same-origin absolute URL to its path', () => {
    const result = resolvePreviewAddress(`${BASE}/users?tab=1#top`, BASE);

    expect(result.crossOrigin).toBe(false);
    expect(result.iframeUrl).toBe(`${BASE}/users?tab=1#top`);
    expect(result.displayPath).toBe('/users?tab=1#top');
  });

  it('navigates cross-origin without persisting the external URL as displayPath', () => {
    const result = resolvePreviewAddress('https://other.com/x', BASE);

    expect(result.crossOrigin).toBe(true);
    expect(result.iframeUrl).toBe('https://other.com/x');
    expect(result.addressInput).toBe('https://other.com/x');

    // The regression: a full external URL must NOT leak into the persisted path.
    expect(result.displayPath).toBeUndefined();
  });

  it('round-trips a restored path without concatenating onto baseUrl', () => {
    // Simulate persist (displayPath) -> restore -> address rebuild after a reload.
    const navigated = resolvePreviewAddress('https://other.com/x', BASE);
    const persistedPath = navigated.displayPath ?? '/';
    const rebuiltAddress = `${BASE}${persistedPath.startsWith('/') ? persistedPath : `/${persistedPath}`}`;

    expect(rebuiltAddress).toBe(`${BASE}/`);
    expect(rebuiltAddress).not.toContain('https://other.com');
  });

  it('returns an empty resolution for a malformed absolute URL', () => {
    const result = resolvePreviewAddress('http://', BASE);

    expect(result.iframeUrl).toBe('');
    expect(result.displayPath).toBeUndefined();
  });
});

describe('evaluatePreviewReadyEdge', () => {
  it('fires on a false -> true edge for the same preview identity', () => {
    const seeded = evaluatePreviewReadyEdge({ key: undefined, ready: undefined }, BASE, false);
    expect(seeded.shouldReload).toBe(false);

    const flipped = evaluatePreviewReadyEdge(seeded.next, BASE, true);
    expect(flipped.shouldReload).toBe(true);
  });

  it('does NOT fire when switching to a different already-ready port', () => {
    // Last reading was on port A and not ready.
    const previous = { key: `${BASE}:5173`, ready: false };

    // User selects a different, already-ready port B.
    const result = evaluatePreviewReadyEdge(previous, `${BASE}:3000`, true);

    expect(result.shouldReload).toBe(false);
    expect(result.next).toEqual({ key: `${BASE}:3000`, ready: true });
  });

  it('does not fire when the port was already ready (no edge)', () => {
    const previous = { key: BASE, ready: true };
    const result = evaluatePreviewReadyEdge(previous, BASE, true);

    expect(result.shouldReload).toBe(false);
  });

  it('does not fire when there is no active preview', () => {
    const result = evaluatePreviewReadyEdge({ key: BASE, ready: false }, undefined, true);

    expect(result.shouldReload).toBe(false);
  });
});
