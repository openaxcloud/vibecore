/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloatingPaneFrame } from './FloatingPaneFrame';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
afterEach(cleanup);

describe('floating frame pointer geometry', () => {
  describe.each([false, true])('canvas smaller than the minimum: %s', (tiny) => {
    it.each(['move', 'resize'] as const)('starts %s from the displayed bounds after the canvas shrinks', (mode) => {
      const onBoundsChange = vi.fn();

      const { getByTestId } = render(
        <div>
          <FloatingPaneFrame
            paneId="audit"
            title="Editor"
            bounds={{ x: 72, y: 72, width: 720, height: 480 }}
            zIndex={20}
            active
            onBoundsChange={onBoundsChange}
            onDock={vi.fn()}
            onFocus={vi.fn()}
          >
            Document
          </FloatingPaneFrame>
        </div>,
      );

      const frame = getByTestId('floating-pane-audit');

      // Browser layout is covered by the E2E; here emulate its constrained result.
      Object.defineProperties(frame, {
        offsetLeft: { value: tiny ? 0 : 30 },
        offsetTop: { value: tiny ? 0 : 10 },
        offsetWidth: { value: tiny ? 240 : 500 },
        offsetHeight: { value: tiny ? 150 : 300 },
      });
      Object.defineProperties(frame.parentElement, {
        clientWidth: { value: tiny ? 240 : 600 },
        clientHeight: { value: tiny ? 150 : 400 },
      });

      const event = (name: string, x: number, y: number) => {
        const e = new Event(name, { bubbles: true });
        Object.assign(e, { button: 0, pointerId: 1, clientX: x, clientY: y });

        return e;
      };
      fireEvent(
        mode === 'move'
          ? frame.querySelector('.bolt-project-floating-pane-header')!
          : getByTestId('resize-floating-pane-audit'),
        event('pointerdown', 20, 20),
      );
      act(() => window.dispatchEvent(event('pointermove', 30, 30)));
      expect(onBoundsChange).toHaveBeenLastCalledWith(
        tiny
          ? { x: 0, y: 0, width: 240, height: 150 }
          : mode === 'move'
            ? { x: 40, y: 20, width: 500, height: 300 }
            : { x: 30, y: 10, width: 510, height: 310 },
      );
      act(() => window.dispatchEvent(event('pointercancel', 30, 30)));
      onBoundsChange.mockClear();
      act(() => window.dispatchEvent(event('pointermove', 60, 60)));
      expect(onBoundsChange).not.toHaveBeenCalled();
    });
  });
});
