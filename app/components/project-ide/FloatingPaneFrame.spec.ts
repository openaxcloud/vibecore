import { describe, expect, it } from 'vitest';
import { clampFloatingPaneBounds } from '~/lib/floating-pane-bounds';

describe('clampFloatingPaneBounds', () => {
  it('keeps a floating pane entirely inside its Project Editor window', () => {
    expect(clampFloatingPaneBounds({ x: 900, y: -50, width: 500, height: 900 }, { width: 1_200, height: 700 })).toEqual(
      { x: 700, y: 0, width: 500, height: 700 },
    );
  });

  it('adapts minimum bounds to compact containers', () => {
    expect(clampFloatingPaneBounds({ x: 20, y: 20, width: 100, height: 100 }, { width: 240, height: 180 })).toEqual({
      x: 0,
      y: 0,
      width: 240,
      height: 180,
    });
  });

  it('normalizes non-finite persisted coordinates', () => {
    expect(
      clampFloatingPaneBounds(
        { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 400, height: 300 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });
});
