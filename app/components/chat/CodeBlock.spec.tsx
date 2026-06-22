/**
 * @vitest-environment jsdom
 *
 * Regression test for the streaming out-of-order highlight bug: during streaming the `code` prop
 * changes on nearly every token, firing overlapping shiki `codeToHtml()` calls whose latency
 * varies. A stale (earlier) invocation must NOT overwrite the HTML produced by a newer one.
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Controllable test double for shiki so we can resolve highlight calls out of order on demand. */
const deferreds: Array<{ code: string; resolve: (html: string) => void }> = [];

vi.mock('shiki', () => ({
  bundledLanguages: { plaintext: {} },
  isSpecialLang: () => false,
  codeToHtml: (code: string) =>
    new Promise<string>((resolve) => {
      deferreds.push({ code, resolve });
    }),
}));

vi.mock('~/lib/stores/theme', async () => {
  const { atom } = await import('nanostores');
  return { themeStore: atom<'dark' | 'light'>('dark') };
});

import { CodeBlock } from './CodeBlock';

describe('CodeBlock streaming highlight cancellation', () => {
  beforeEach(() => {
    deferreds.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ignores a stale highlight that resolves after a newer one', async () => {
    const { container, rerender } = render(<CodeBlock code="part" language="plaintext" disableCopy />);

    /* First (stale) highlight call captured for "part". */
    await waitFor(() => expect(deferreds).toHaveLength(1));

    const stale = deferreds[0];
    expect(stale.code).toBe('part');

    /* A new token arrives — prop changes, firing a second highlight call. */
    rerender(<CodeBlock code="partial" language="plaintext" disableCopy />);
    await waitFor(() => expect(deferreds).toHaveLength(2));

    const fresh = deferreds[1];
    expect(fresh.code).toBe('partial');

    /* Resolve the NEWER call first... */
    fresh.resolve('<pre>partial</pre>');
    await waitFor(() => expect(container.innerHTML).toContain('partial'));

    /* ...then let the STALE call resolve late. It must be ignored, not overwrite the fresh HTML. */
    stale.resolve('<pre>part</pre>');

    /* Give any (incorrect) setState a chance to flush, then assert the fresh content survived. */
    await Promise.resolve();
    await waitFor(() => {
      expect(container.innerHTML).toContain('partial');
      expect(container.innerHTML).not.toContain('<pre>part</pre>');
    });
  });

  it('renders the highlighted HTML for a stable (non-streaming) block', async () => {
    const { container } = render(<CodeBlock code="const x = 1;" language="plaintext" disableCopy />);

    await waitFor(() => expect(deferreds).toHaveLength(1));
    deferreds[0].resolve('<pre>const x = 1;</pre>');

    await waitFor(() => expect(container.innerHTML).toContain('const x = 1;'));
  });
});
