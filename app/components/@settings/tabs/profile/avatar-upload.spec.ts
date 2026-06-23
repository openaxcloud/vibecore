import { describe, expect, it } from 'vitest';
import {
  approximateDataUrlBytes,
  downscaleAvatarDataUrl,
  fitWithinMaxEdge,
  isQuotaExceededError,
} from './avatar-upload';

describe('isQuotaExceededError', () => {
  it('detects a Chrome/Safari QuotaExceededError DOMException', () => {
    const err = Object.assign(new Error('quota'), { name: 'QuotaExceededError', code: 22 });
    expect(isQuotaExceededError(err)).toBe(true);
  });

  it('detects the legacy Firefox quota error', () => {
    const err = Object.assign(new Error('quota'), { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 });
    expect(isQuotaExceededError(err)).toBe(true);
  });

  it('detects by numeric code alone', () => {
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
  });

  it('returns false for unrelated errors and nullish values', () => {
    expect(isQuotaExceededError(new Error('network'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });
});

describe('approximateDataUrlBytes', () => {
  it('approximates the decoded byte length of a data URL', () => {
    // "hello" -> base64 "aGVsbG8=" (8 chars, 1 pad) -> 5 bytes
    const dataUrl = 'data:text/plain;base64,aGVsbG8=';
    expect(approximateDataUrlBytes(dataUrl)).toBe(5);
  });

  it('handles raw base64 without a data URL prefix', () => {
    expect(approximateDataUrlBytes('aGVsbG8=')).toBe(5);
  });
});

describe('fitWithinMaxEdge', () => {
  it('does not upscale images already within bounds', () => {
    expect(fitWithinMaxEdge(100, 80, 256)).toEqual({ width: 100, height: 80 });
  });

  it('scales down preserving aspect ratio', () => {
    expect(fitWithinMaxEdge(1000, 500, 256)).toEqual({ width: 256, height: 128 });
  });

  it('returns zero dimensions for invalid input', () => {
    expect(fitWithinMaxEdge(0, 0, 256)).toEqual({ width: 0, height: 0 });
  });
});

describe('downscaleAvatarDataUrl', () => {
  it('returns the original data URL when the canvas pipeline is unavailable (SSR/jsdom-less)', async () => {
    /*
     * In a node test environment without document/Image the helper must be a
     * safe no-op rather than throwing, so the caller always gets a usable value.
     */
    const original = 'data:image/png;base64,aGVsbG8=';
    const result = await downscaleAvatarDataUrl(original);
    expect(typeof result).toBe('string');
    expect(result).toBe(original);
  });
});
