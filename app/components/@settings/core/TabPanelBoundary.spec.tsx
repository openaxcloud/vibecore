/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabPanelBoundary } from './TabPanelBoundary';

function ThrowingTab({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    // Mimics a rejected React.lazy() chunk import surfacing during render.
    throw new Error('Loading chunk settings-tab failed');
  }

  return <div>Tab content</div>;
}

describe('<TabPanelBoundary />', () => {
  beforeEach(() => {
    // React logs the caught error to console.error; silence it for clean output.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('contains a thrown chunk-load error with an inline retry fallback instead of rethrowing', () => {
    render(
      <TabPanelBoundary>
        <ThrowingTab shouldThrow />
      </TabPanelBoundary>,
    );

    expect(screen.getByText('This section could not load')).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('renders children unchanged when nothing throws', () => {
    render(
      <TabPanelBoundary>
        <ThrowingTab shouldThrow={false} />
      </TabPanelBoundary>,
    );

    expect(screen.getByText('Tab content')).toBeTruthy();
    expect(screen.queryByText('This section could not load')).toBeNull();
  });

  it('clears its error state and invokes onRetry so the parent can remount the lazy subtree', () => {
    const onRetry = vi.fn();

    render(
      <TabPanelBoundary onRetry={onRetry}>
        <ThrowingTab shouldThrow />
      </TabPanelBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
