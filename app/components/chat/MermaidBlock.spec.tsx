/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Stub the heavy `mermaid` runtime with a deterministic test double so the
 * component's success path can be exercised without bundling the real engine.
 */
const renderMock = vi.fn(async (_id: string, _code: string) => ({
  svg: '<svg data-testid="diagram"><g></g></svg>',
  bindFunctions: undefined,
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMock,
  },
}));

// Theme store is read via useStore; provide a minimal real nanostore-like value.
vi.mock('~/lib/stores/theme', async () => {
  const { atom } = await vi.importActual<typeof import('nanostores')>('nanostores');

  return { themeStore: atom('light') };
});

import { MermaidBlock } from './MermaidBlock';

afterEach(() => {
  cleanup();
  renderMock.mockClear();
});

describe('MermaidBlock', () => {
  it('renders the produced SVG on a successful render without throwing', async () => {
    /*
     * Before the fix this threw:
     * "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
     * because the canvas <div> mixed dangerouslySetInnerHTML with JSX children.
     */
    const { container } = render(<MermaidBlock code="graph TD; A-->B;" />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="diagram"]')).not.toBeNull();
    });

    const canvas = container.querySelector('.bolt-mermaid-block-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.innerHTML).toContain('data-testid="diagram"');

    // Loading/error UI must not be inside the innerHTML canvas.
    expect(screen.queryByText(/Rendering diagram/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the error state as a sibling, never as a child of the innerHTML canvas', async () => {
    renderMock.mockRejectedValueOnce(new Error('boom syntax error'));

    const { container } = render(<MermaidBlock code="not a diagram" />);

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });

    const canvas = container.querySelector('.bolt-mermaid-block-canvas');

    // The canvas stays childless (innerHTML driven); the error UI is a sibling.
    expect(canvas?.querySelector('.bolt-mermaid-block-error')).toBeNull();
    expect(container.querySelector('.bolt-mermaid-block-error')).not.toBeNull();
    expect(screen.getByText(/boom syntax error/i)).not.toBeNull();
  });
});
