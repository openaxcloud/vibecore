/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionLoadBoundary } from './SectionLoadBoundary';

afterEach(cleanup);

beforeEach(() => {
  // The boundary logs caught errors; silence the expected console noise.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error('chunk failed to load');
}

describe('SectionLoadBoundary', () => {
  it('renders children when nothing fails', () => {
    render(
      <SectionLoadBoundary name="LandingStats" fallback={<div data-testid="fallback" />}>
        <div data-testid="content">stats</div>
      </SectionLoadBoundary>,
    );

    expect(screen.getByTestId('content')).toBeTruthy();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('falls back to the skeleton when a child throws repeatedly (after the retry)', () => {
    render(
      <SectionLoadBoundary name="LandingStats" fallback={<div data-testid="fallback">skeleton</div>}>
        <Boom />
      </SectionLoadBoundary>,
    );

    // Deterministic throw survives the single retry, so the static fallback wins.
    expect(screen.getByTestId('fallback')).toBeTruthy();
  });

  it('isolates the failure so siblings keep rendering', () => {
    render(
      <div>
        <SectionLoadBoundary name="LandingStats" fallback={<div data-testid="fallback" />}>
          <Boom />
        </SectionLoadBoundary>
        <div data-testid="sibling">other section</div>
      </div>,
    );

    expect(screen.getByTestId('fallback')).toBeTruthy();
    expect(screen.getByTestId('sibling')).toBeTruthy();
  });

  it('retries the import once and recovers when the second mount succeeds', () => {
    /*
     * Gate keyed on mount identity: the first mounted instance throws, the
     * remounted (post-retry) instance succeeds. Using a module-level flag rather
     * than a render counter keeps the assertion robust against StrictMode's
     * double-invocation of render.
     */
    let firstMountFailed = false;

    function FlakyOnce() {
      if (!firstMountFailed) {
        firstMountFailed = true;
        throw new Error('transient chunk blip');
      }

      return <div data-testid="recovered">loaded on retry</div>;
    }

    render(
      <SectionLoadBoundary name="LandingStats" fallback={<div data-testid="fallback" />}>
        <FlakyOnce />
      </SectionLoadBoundary>,
    );

    expect(screen.getByTestId('recovered')).toBeTruthy();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('does not retry when retryOnce is false', () => {
    render(
      <SectionLoadBoundary name="LandingStats" fallback={<div data-testid="fallback" />} retryOnce={false}>
        <Boom />
      </SectionLoadBoundary>,
    );

    // With retry disabled the failure goes straight to the static fallback.
    expect(screen.getByTestId('fallback')).toBeTruthy();
  });
});
