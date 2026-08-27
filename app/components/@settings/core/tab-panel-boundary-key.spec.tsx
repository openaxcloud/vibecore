/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabPanelBoundary } from './TabPanelBoundary';
import { getTabPanelBoundaryKey } from './tab-panel-boundary-key';
import type { TabType } from './types';

function ThrowingTab({ shouldThrow, label }: { shouldThrow: boolean; label: string }) {
  if (shouldThrow) {
    // Mimics a rejected React.lazy() chunk import surfacing during render.
    throw new Error('Loading chunk settings-tab failed');
  }

  return <div>{label}</div>;
}

/**
 * Mirrors how ControlPanel renders the active tab: a single boundary whose key
 * comes from getTabPanelBoundaryKey(activeTab, reloadKey). Changing `tab` here
 * reproduces a direct tab switch (no return to the tile grid in between).
 */
function ActiveTabPanel({ tab, reloadKey }: { tab: TabType; reloadKey: number }) {
  return (
    <TabPanelBoundary key={getTabPanelBoundaryKey(tab, reloadKey)}>
      <ThrowingTab shouldThrow={tab === 'data'} label={`${tab} content`} />
    </TabPanelBoundary>
  );
}

describe('getTabPanelBoundaryKey', () => {
  it('encodes both the tab id and the reload counter', () => {
    expect(getTabPanelBoundaryKey('profile', 0)).toBe('profile-0');
    expect(getTabPanelBoundaryKey('settings', 3)).toBe('settings-3');
  });

  it('produces a different key for a different tab at the same reload counter', () => {
    expect(getTabPanelBoundaryKey('data', 0)).not.toBe(getTabPanelBoundaryKey('profile', 0));
  });

  it('produces a different key for the same tab after a reload bump', () => {
    expect(getTabPanelBoundaryKey('data', 0)).not.toBe(getTabPanelBoundaryKey('data', 1));
  });
});

describe('TabPanelBoundary keyed by tab id', () => {
  beforeEach(() => {
    // React logs the caught error to console.error; silence it for clean output.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not leak a failed tab error onto the next tab when switching directly', () => {
    // Tab whose lazy import "fails" → boundary shows the error fallback.
    const { rerender } = render(<ActiveTabPanel tab="data" reloadKey={0} />);
    expect(screen.getByText('This section could not load')).toBeTruthy();

    // Switch straight to a loadable tab (e.g. via the header AvatarDropdown).
    rerender(<ActiveTabPanel tab="profile" reloadKey={0} />);

    // The new tab renders cleanly; the stale error fallback is gone.
    expect(screen.queryByText("Couldn't load this section")).toBeNull();
    expect(screen.getByText('profile content')).toBeTruthy();
  });
});
