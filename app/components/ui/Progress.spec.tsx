/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from './Progress';

/**
 * Regression: the Progress track used `bg-bolt-elements-background`, which is NOT
 * a real UnoCSS token — in uno.config.ts `bolt.elements.background` is a nested
 * object whose only leaves are `background.depth.1..4`. As a result UnoCSS emitted
 * no background rule and the unfilled track rendered invisible (and at 0% nothing
 * showed at all, since the fill is translated -100% off-screen). The track must
 * use a real depth token, matching the RangeSlider track.
 */
describe('Progress track background', () => {
  it('uses a resolvable depth background token for the track', () => {
    const { container } = render(<Progress value={42} />);
    const track = container.firstElementChild as HTMLElement;

    /*
     * The broken, non-resolving token must be gone (assert with a boundary so the
     * depth token does not satisfy the negative match).
     */
    expect(track.className).not.toMatch(/bg-bolt-elements-background(?![-/\w])/);

    // It must use a real depth-based token instead.
    expect(track.className).toContain('bg-bolt-elements-background-depth-3');
  });

  it('still forwards a custom className alongside the track token', () => {
    const { container } = render(<Progress value={10} className="my-extra" />);
    const track = container.firstElementChild as HTMLElement;

    expect(track.className).toContain('bg-bolt-elements-background-depth-3');
    expect(track.className).toContain('my-extra');
  });
});
