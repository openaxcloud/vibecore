import { describe, expect, it } from 'vitest';
import { applyDocumentIsolationHeaders } from './entry.server';

describe('entry server document isolation headers', () => {
  it('uses credentialless COEP for WebContainer previews', () => {
    const headers = new Headers();

    applyDocumentIsolationHeaders(headers);

    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
});
