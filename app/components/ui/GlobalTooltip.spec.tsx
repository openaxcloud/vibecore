import { readFileSync } from 'node:fs';

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { StrictMode, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalTooltip } from './GlobalTooltip';
import { useKeybindings } from '~/lib/hooks/useKeybindings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-vc-tooltip-renderer');
});

describe('GlobalTooltip ownership', () => {
  it('dismisses visible help on a mouse activation, including focus before click', () => {
    vi.useFakeTimers();
    render(
      <>
        <button title="Tools" data-vc-tooltip="Tools">
          Tools
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Tools' });
    fireEvent.pointerOver(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focusIn(button);
    fireEvent.click(button);
    button.setAttribute('data-vc-tooltip-hidden', 'true');
    button.removeAttribute('data-vc-tooltip');
    button.removeAttribute('title');
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focusIn(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each(['hidden', 'removed'] as const)('does not publish delayed help when its attribute becomes %s', (mode) => {
    vi.useFakeTimers();

    const view = render(
      <>
        <button title="Tools" data-vc-tooltip="Tools">
          Tools
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Tools' });
    fireEvent.pointerOver(button, { pointerType: 'mouse' });

    if (mode === 'hidden') {
      button.setAttribute('data-vc-tooltip-hidden', 'true');
    } else {
      button.removeAttribute('data-vc-tooltip');
    }

    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();

    if (mode === 'hidden') {
      expect(button.hasAttribute('title')).toBe(false);
      view.unmount();
      expect(button.hasAttribute('title')).toBe(false);
    }
  });

  it('restores a temporarily suppressed title when the renderer unmounts', () => {
    const button = document.createElement('button');
    button.setAttribute('title', 'Files');
    button.setAttribute('data-vc-tooltip', 'Files');
    button.setAttribute('data-vc-radix-tooltip', 'true');
    document.body.append(button);

    const view = render(<GlobalTooltip />);
    fireEvent.focusIn(button);
    expect(button.hasAttribute('title')).toBe(false);
    view.unmount();
    expect(button.getAttribute('title')).toBe('Files');
    button.remove();
  });

  it('leaves Radix controls and their accessible labels to their existing tooltip', () => {
    vi.useFakeTimers();
    render(
      <>
        <button aria-label="Files" title="Files" data-vc-tooltip="Files" data-vc-radix-tooltip="true">
          <span>File icon</span>
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Files' });
    fireEvent.pointerOver(screen.getByText('File icon'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focusIn(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Files');
    fireEvent.focusOut(button);
    expect(button.getAttribute('title')).toBe('Files');
  });

  it('still shows ordinary help and restores its native title after leaving', () => {
    vi.useFakeTimers();
    render(
      <>
        <button title="Full file path" data-vc-tooltip="Open full file path">
          File
        </button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'File' });
    fireEvent.pointerOver(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('tooltip').textContent).toBe('Open full file path');
    expect(button.hasAttribute('title')).toBe(false);
    fireEvent.pointerOut(button, { relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('title')).toBe('Full file path');
  });
});

describe('GlobalTooltip renderer lifetime', () => {
  const marker = 'data-vc-tooltip-renderer';

  it('owns CSS fallback only while a renderer is mounted', () => {
    expect(document.documentElement.hasAttribute(marker)).toBe(false);

    const view = render(<GlobalTooltip />);
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    view.unmount();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it('retains ownership until the last renderer unmounts', () => {
    const first = render(<GlobalTooltip />);
    const second = render(<GlobalTooltip />);
    first.unmount();
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    second.unmount();
    expect(document.documentElement.hasAttribute(marker)).toBe(false);
  });

  it('restores a preexisting marker across StrictMode effect replay', () => {
    document.documentElement.setAttribute(marker, 'external');

    const view = render(
      <StrictMode>
        <GlobalTooltip />
      </StrictMode>,
    );
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    view.unmount();
    expect(document.documentElement.getAttribute(marker)).toBe('external');
    document.documentElement.removeAttribute(marker);
  });

  it.each(['Escape', 'scroll'] as const)('keeps the CSS fallback suppressed after %s dismisses help', (event) => {
    render(
      <>
        <button data-vc-tooltip="Full key">Key</button>
        <GlobalTooltip />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Key' });
    fireEvent.focusIn(button);
    expect(screen.getByRole('tooltip').textContent).toBe('Full key');

    if (event === 'Escape') {
      fireEvent.keyDown(button, { key: 'Escape' });
    } else {
      fireEvent.scroll(window);
    }

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.documentElement.getAttribute(marker)).toBe('true');
    expect(button.getAttribute('data-vc-tooltip')).toBe('Full key');
  });
});

describe('GlobalTooltip with the IDE keyboard handler', () => {
  it.each([true, false])(
    'dismisses help without blocking the IDE action (keyboard listener first: %s)',
    (keyboardFirst) => {
      const runAction = vi.fn();

      function KeyboardBindings() {
        useKeybindings({
          bindings: [{ combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' }],
          getContext: () => ({}),
          runAction,
        });
        return null;
      }

      render(
        <>
          {keyboardFirst && <KeyboardBindings />}
          <button data-vc-tooltip="Full key">Key</button>
          <GlobalTooltip />
          {!keyboardFirst && <KeyboardBindings />}
        </>,
      );

      const button = screen.getByRole('button', { name: 'Key' });
      fireEvent.focusIn(button);
      expect(screen.getByRole('tooltip').textContent).toBe('Full key');
      fireEvent.keyDown(button, { key: 'Escape' });
      expect(runAction).toHaveBeenCalledOnce();
      expect(runAction.mock.calls[0][0]).toBe('overlay.close');
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(document.documentElement.getAttribute('data-vc-tooltip-renderer')).toBe('true');
    },
  );

  it('leaves Escape to the local menu and preserves the global save shortcut', () => {
    const runAction = vi.fn();
    const localEscape = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      useKeybindings({
        bindings: [
          { combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' },
          { combo: 'cmd+s', action: 'file.save', label: '', description: '', category: 'File' },
        ],
        getContext: () => ({}),
        runAction,
      });

      return (
        <>
          <div
            data-ide-escape-owner={open ? 'composer-tools' : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                localEscape(event.defaultPrevented);
                setOpen(false);
              }
            }}
          >
            <button data-vc-tooltip="Full key">Key</button>
          </div>
          <GlobalTooltip />
        </>
      );
    }

    render(<Harness />);

    const button = screen.getByRole('button', { name: 'Key' });
    fireEvent.focusIn(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(localEscape).toHaveBeenCalledWith(false);
    expect(runAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.keyDown(button, { key: 's', ctrlKey: true });
    expect(runAction.mock.calls[0][0]).toBe('file.save');
  });
});

describe('GlobalTooltip native zoom viewport', () => {
  it.each([195, 410, 640])('keeps long help inside a %ipx CSS viewport', (width) => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

    try {
      const text = 'SYNTHETIC_LONG_KEY_'.repeat(20);
      render(
        <>
          <button data-vc-tooltip={text}>Actions</button>
          <GlobalTooltip />
        </>,
      );

      const button = screen.getByRole('button', { name: 'Actions' });
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        left: width - 40,
        right: width - 16,
        top: 120,
        bottom: 144,
        width: 24,
        height: 24,
        x: width - 40,
        y: 120,
        toJSON: () => ({}),
      });
      fireEvent.focusIn(button);

      const tip = screen.getByRole('tooltip');
      expect(tip.textContent).toBe(text);
      expect(Number.parseFloat(tip.style.left)).toBeGreaterThanOrEqual(8);
      expect(Number.parseFloat(tip.style.left) + Math.min(280, width - 16)).toBeLessThanOrEqual(width - 8);
      expect(tip.style.maxWidth).toBe('min(280px, calc(100vw - 16px))');
      expect(tip.style.overflowWrap).toBe('anywhere');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
    }
  });
});

describe('GlobalTooltip measured vertical position', () => {
  it.each([
    { viewport: 300, height: 258.875, anchorBottom: 186, expectedTop: 33.125 },
    { viewport: 422, height: 212.0234375, anchorBottom: 227.234375, expectedTop: 201.9765625 },
  ])(
    'positions measured help with an 8px gutter ($viewport/$height)',
    ({ viewport, height, anchorBottom, expectedTop }) => {
      const original = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport });

      const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const measuredHeight = this.getAttribute('role') === 'tooltip' ? height : 32;
        const top = this.getAttribute('role') === 'tooltip' ? Number.parseFloat(this.style.top) : anchorBottom - 32;

        return {
          x: 8,
          y: top,
          left: 8,
          right: 288,
          width: 280,
          height: measuredHeight,
          top,
          bottom: top + measuredHeight,
          toJSON: () => ({}),
        };
      });

      try {
        const text = 'CLE_FRANCAISE_SYNTHETIQUE_'.repeat(20);

        const view = render(
          <>
            <button data-vc-tooltip={text}>Actions</button>
            <GlobalTooltip />
          </>,
        );
        fireEvent.focusIn(screen.getByRole('button', { name: 'Actions' }));

        const tip = screen.getByRole('tooltip');
        expect(Number.parseFloat(tip.style.top)).toBe(expectedTop);
        expect(tip.textContent).toBe(text);
        expect(tip.hasAttribute('tabindex')).toBe(false);
        expect(rectSpy.mock.calls.length).toBeLessThanOrEqual(3);
        view.rerender(
          <>
            <button data-vc-tooltip={text}>Actions</button>
            <GlobalTooltip />
          </>,
        );
        expect(Number.parseFloat(tip.style.top)).toBe(expectedTop);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('tooltip')).toBeNull();
      } finally {
        rectSpy.mockRestore();
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: original });
      }
    },
  );
});

describe('GlobalTooltip paint layer', () => {
  it('paints above the fixed IDE header but below menus and modals without intercepting input', () => {
    render(
      <>
        <button data-vc-tooltip="Help">Actions</button>
        <GlobalTooltip />
      </>,
    );
    fireEvent.focusIn(screen.getByRole('button', { name: 'Actions' }));

    const tooltip = screen.getByRole('tooltip');
    const layer = Number(tooltip.className.match(/z-\[(\d+)\]/)?.[1]);
    const css = readFileSync('app/styles/index.scss', 'utf8');

    expect(Number.isFinite(layer)).toBe(true);
    expect(layer).toBeGreaterThan(0);

    const layerFor = (selector: string) => {
      const value = Math.max(
        ...css
          .split(selector)
          .slice(1)
          .map((block) => Number(block.split('}')[0].match(/z-index:\s*(\d+)/)?.[1] ?? 0)),
      );
      expect(Number.isFinite(value), `Missing finite layer for ${selector}`).toBe(true);
      expect(value, `Missing positive layer for ${selector}`).toBeGreaterThan(0);

      return value;
    };
    expect(layer).toBeGreaterThan(layerFor('.bolt-mobile-ecode-header {'));
    expect(layer).toBeLessThan(layerFor('.bolt-message-context-menu {'));
    expect(layer).toBeLessThan(layerFor('.bolt-secrets-menu {'));
    expect(layer).toBeLessThan(layerFor('.bolt-secrets-editor-veil {'));
    expect(tooltip.className).toContain('pointer-events-none');
    expect(tooltip.hasAttribute('tabindex')).toBe(false);
  });
});

describe('Oversized help explicit reading surface', () => {
  const fullText = 'FIRST_SYNTHETIC_LINE\n' + 'LONG_HELP_'.repeat(100) + '\nLAST_SYNTHETIC_LINE';

  function clipTooltip() {
    return vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'tooltip' ? 500 : 0;
    });
  }

  it.each(['button', 'F1'])(
    'opens deliberately via %s, preserves all text and returns focus on Escape',
    async (activation) => {
      const clipping = clipTooltip();

      try {
        render(
          <>
            <button data-vc-tooltip={fullText}>Anchor</button>
            <button>Next</button>
            <GlobalTooltip />
          </>,
        );

        const anchor = screen.getByRole('button', { name: 'Anchor' });
        act(() => anchor.focus());
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.activeElement).toBe(anchor);

        const read = screen.getByRole('button', { name: 'Read full help (F1)' });

        if (activation === 'F1') {
          fireEvent.keyDown(anchor, { key: 'F1' });
        } else {
          fireEvent.pointerDown(read, { pointerType: 'mouse' });
          fireEvent.click(read);
        }

        expect(screen.getByRole('dialog', { name: 'Full help' })).toBeTruthy();

        const region = screen.getByRole('region', { name: 'Help text' });
        expect(region.textContent).toBe(fullText);
        expect(document.activeElement).toBe(region);
        expect(region.className).toContain('overflow-auto');
        expect(fireEvent.keyDown(region, { key: 'PageDown' })).toBe(true);
        expect(fireEvent.keyDown(region, { key: 'End' })).toBe(true);
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(fireEvent.keyDown(region, { key: 'Tab' })).toBe(true);
        expect(fireEvent.keyDown(region, { key: 'Tab', shiftKey: true })).toBe(true);
        fireEvent.keyDown(region, { key: 'Escape' });
        await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await vi.waitFor(() => expect(document.activeElement).toBe(anchor));
      } finally {
        clipping.mockRestore();
      }
    },
  );

  it('does not claim F1 from another anchor and dismisses stale help without focusing a detached project', async () => {
    const clipping = clipTooltip();

    try {
      const view = render(
        <>
          <button data-vc-tooltip={fullText}>Anchor</button>
          <button>Next</button>
          <GlobalTooltip />
        </>,
      );

      const anchor = screen.getByRole('button', { name: 'Anchor' });
      act(() => anchor.focus());

      const next = screen.getByRole('button', { name: 'Next' });
      act(() => next.focus());
      expect(document.activeElement).toBe(next);
      expect(fireEvent.keyDown(next, { key: 'F1' })).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
      act(() => anchor.focus());
      fireEvent.keyDown(anchor, { key: 'F1' });
      expect(screen.getByRole('dialog')).toBeTruthy();
      view.rerender(
        <>
          <button key="replacement">Replacement project</button>
          <button>Next</button>
          <GlobalTooltip />
        </>,
      );
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).not.toBe(anchor);
    } finally {
      clipping.mockRestore();
    }
  });

  it.each([true, false])('preserves real IDE Escape and save (keyboard listener first: %s)', (keyboardFirst) => {
    const clipping = clipTooltip();
    const runAction = vi.fn();

    function Keys() {
      useKeybindings({
        bindings: [
          { combo: 'cmd+s', action: 'file.save', label: '', description: '', category: 'File' },
          { combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' },
        ],
        getContext: () => ({}),
        runAction,
      });
      return null;
    }

    try {
      render(
        <>
          {keyboardFirst && <Keys />}
          <button data-vc-tooltip={fullText}>Anchor</button>
          <GlobalTooltip />
          {!keyboardFirst && <Keys />}
        </>,
      );

      const anchor = screen.getByRole('button', { name: 'Anchor' });
      act(() => anchor.focus());
      fireEvent.keyDown(anchor, { key: 'F1' });
      fireEvent.keyDown(screen.getByRole('region'), { key: 's', ctrlKey: true });
      expect(runAction).toHaveBeenCalledOnce();
      expect(runAction.mock.calls[0][0]).toBe('file.save');
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(runAction).toHaveBeenCalledOnce();
    } finally {
      clipping.mockRestore();
    }
  });
  it('keeps the original text while resizing, scrolling and hovering another control, then closes on a project route change', async () => {
    const clipping = clipTooltip();
    const originalPath = window.location.pathname;

    try {
      render(
        <>
          <button data-vc-tooltip={fullText}>Anchor</button>
          <button data-vc-tooltip="Other project text">Other</button>
          <GlobalTooltip />
        </>,
      );

      const anchor = screen.getByRole('button', { name: 'Anchor' });
      act(() => anchor.focus());
      fireEvent.keyDown(anchor, { key: 'F1' });
      fireEvent(window, new Event('resize'));
      fireEvent.scroll(screen.getByRole('region'));
      fireEvent.pointerOver(screen.getByRole('button', { name: 'Other' }), { pointerType: 'mouse' });
      expect(screen.getByRole('region').textContent).toBe(fullText);
      window.history.pushState({}, '', '/projects/synthetic-other/ide');
      fireEvent(window, new PopStateEvent('popstate'));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).not.toBe(anchor);
    } finally {
      window.history.replaceState({}, '', originalPath);
      clipping.mockRestore();
    }
  });
  it('names the explicit action and complete reading surface in French', async () => {
    const clipping = clipTooltip();
    const i18n = createInstance();
    await i18n.init({ lng: 'fr', resources: {}, initImmediate: false });

    try {
      render(
        <I18nextProvider i18n={i18n}>
          <button data-vc-tooltip={fullText}>Ancre</button>
          <GlobalTooltip />
        </I18nextProvider>,
      );

      const anchor = screen.getByRole('button', { name: 'Ancre' });
      act(() => anchor.focus());
      fireEvent.click(screen.getByRole('button', { name: 'Lire l’aide complète (F1)' }));
      expect(screen.getByRole('dialog', { name: 'Aide complète' })).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Texte de l’aide' }).textContent).toBe(fullText);
      fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(anchor);
    } finally {
      clipping.mockRestore();
    }
  });

  it('leaves native F1 untouched for ordinary short help', () => {
    render(
      <>
        <button data-vc-tooltip="Short help">Anchor</button>
        <GlobalTooltip />
      </>,
    );

    const anchor = screen.getByRole('button', { name: 'Anchor' });
    act(() => anchor.focus());
    expect(screen.getByRole('tooltip').textContent).toBe('Short help');
    expect(fireEvent.keyDown(anchor, { key: 'F1' })).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps the explicit action across the pointer gap and restores the native title when leaving help', () => {
    vi.useFakeTimers();

    const clipping = clipTooltip();

    try {
      render(
        <>
          <button title="Native help" data-vc-tooltip={fullText}>
            Anchor
          </button>
          <GlobalTooltip />
        </>,
      );

      const anchor = screen.getByRole('button', { name: 'Anchor' });
      fireEvent.pointerOver(anchor, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(500));
      fireEvent.pointerOut(anchor, { pointerType: 'mouse', relatedTarget: document.body });
      fireEvent.pointerOver(document.body, { pointerType: 'mouse' });

      const read = screen.getByRole('button', { name: 'Read full help (F1)' });
      fireEvent.pointerDown(read, { pointerType: 'mouse' });
      fireEvent.click(read);
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(anchor.getAttribute('title')).toBe('Native help');
    } finally {
      clipping.mockRestore();
    }
  });

  it('closes when keyboard focus leaves the nonmodal surface without reclaiming focus on Escape', () => {
    const clipping = clipTooltip();

    try {
      render(
        <>
          <button data-vc-tooltip={fullText}>Anchor</button>
          <button>Outside</button>
          <GlobalTooltip />
        </>,
      );

      const anchor = screen.getByRole('button', { name: 'Anchor' });
      act(() => anchor.focus());
      fireEvent.keyDown(anchor, { key: 'F1' });

      const outside = screen.getByRole('button', { name: 'Outside' });
      act(() => outside.focus());
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.keyDown(outside, { key: 'Escape' });
      expect(document.activeElement).toBe(outside);
    } finally {
      clipping.mockRestore();
    }
  });
  it('cancels another anchor’s delayed tooltip before opening help, including a later project route change', () => {
    vi.useFakeTimers();

    const originalPath = window.location.pathname;

    const clipping = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute('role') === 'tooltip' && this.textContent === fullText ? 500 : 0;
    });

    try {
      render(
        <>
          <button data-vc-tooltip={fullText}>Anchor A</button>
          <button data-vc-tooltip="OTHER SHORT HELP">Anchor B</button>
          <GlobalTooltip />
        </>,
      );

      const anchorA = screen.getByRole('button', { name: 'Anchor A' });
      const anchorB = screen.getByRole('button', { name: 'Anchor B' });
      fireEvent.pointerOver(anchorA, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(500));

      const read = screen.getByRole('button', { name: 'Read full help (F1)' });
      fireEvent.pointerOver(anchorB, { pointerType: 'mouse' });
      fireEvent.pointerDown(read, { pointerType: 'mouse' });
      fireEvent.click(read);
      expect(screen.getByRole('region').textContent).toBe(fullText);
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole('dialog')).toBeTruthy();
      window.history.pushState({}, '', '/projects/synthetic-next/ide');
      fireEvent(window, new PopStateEvent('popstate'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Read full help (F1)' })).toBeNull();
      expect(document.activeElement).not.toBe(anchorA);
      expect(document.activeElement).not.toBe(anchorB);
    } finally {
      window.history.replaceState({}, '', originalPath);
      clipping.mockRestore();
    }
  });
});
