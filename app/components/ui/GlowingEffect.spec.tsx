/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeShortestAngle } from './glowing-effect-angle';

const { animate, stops } = vi.hoisted(() => {
  const stops: Array<ReturnType<typeof vi.fn>> = [];

  const animate = vi.fn(() => {
    const stop = vi.fn();
    stops.push(stop);

    return { stop } as unknown as { stop: () => void };
  });

  return { animate, stops };
});

vi.mock('framer-motion', () => ({
  animate,
}));

/* Imported after the mock so the component picks up the mocked `animate`. */
// eslint-disable-next-line import/order
import { GlowingEffect } from './GlowingEffect';

describe('computeShortestAngle', () => {
  it('returns the same angle when target equals current', () => {
    expect(computeShortestAngle(90, 90)).toBe(90);
  });

  it('takes the short way around rather than spinning the full circle', () => {
    /* From 350deg to 10deg should be +20 (-> 370), not -340. */
    expect(computeShortestAngle(350, 10)).toBe(370);

    /* From 10deg to 350deg should be -20 (-> -10), not +340. */
    expect(computeShortestAngle(10, 350)).toBe(-10);
  });

  it('never produces a delta outside [-180, 180)', () => {
    for (let current = 0; current < 360; current += 37) {
      for (let target = 0; target < 360; target += 53) {
        const delta = computeShortestAngle(current, target) - current;
        expect(delta).toBeGreaterThanOrEqual(-180);
        expect(delta).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('GlowingEffect tween lifecycle', () => {
  afterEach(() => {
    cleanup();
    animate.mockClear();
    stops.length = 0;
    vi.useRealTimers();
  });

  function dispatchPointerMove(x: number, y: number) {
    const event = new Event('pointermove') as PointerEvent & { x: number; y: number };
    Object.assign(event, { x, y });
    document.body.dispatchEvent(event);
  }

  it('stops the previous tween before starting a new one (no unbounded concurrent tweens)', () => {
    /* requestAnimationFrame runs synchronously so each move flushes immediately. */
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { container } = render(<GlowingEffect disabled={false} proximity={9999} inactiveZone={0} />);

    /*
     * jsdom getBoundingClientRect returns zeros; force a non-zero rect so the
     * element registers as active and the angle tween is scheduled.
     */
    const target = container.querySelector('[style]') as HTMLElement;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    /* Several rapid pointer moves, as would happen while dragging the cursor. */
    dispatchPointerMove(180, 100);
    dispatchPointerMove(160, 100);
    dispatchPointerMove(140, 100);

    expect(animate).toHaveBeenCalledTimes(3);

    /*
     * Every tween except the most recent must have been stopped, so at most one
     * tween is ever live at a time.
     */
    const liveTweens = stops.filter((stop) => stop.mock.calls.length === 0);
    expect(liveTweens).toHaveLength(1);

    rafSpy.mockRestore();
  });

  it('stops the in-flight tween on unmount', () => {
    /* requestAnimationFrame runs synchronously so each move flushes immediately. */
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { container, unmount } = render(<GlowingEffect disabled={false} proximity={9999} inactiveZone={0} />);

    const target = container.querySelector('[style]') as HTMLElement;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    dispatchPointerMove(180, 100);
    expect(stops).toHaveLength(1);
    expect(stops[0]).not.toHaveBeenCalled();

    unmount();

    expect(stops[0]).toHaveBeenCalledTimes(1);

    rafSpy.mockRestore();
  });
});
