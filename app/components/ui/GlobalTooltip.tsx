import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { infobulleAutoriseeAuFocus, pointeurSansSurvol } from './infobulle-tactile';

/**
 * App-wide renderer for `data-vc-tooltip` attributes.
 *
 * Across the app many controls (IconButton, the project IDE header, the chat
 * composer toolbar, Supabase connect, …) set a `data-vc-tooltip="…"` attribute
 * expecting a styled tooltip — but nothing ever consumed it, so those tooltips
 * silently never appeared (the only fallback was a native `title`, which many of
 * those call sites don't set). Rather than wrap dozens of call sites in Radix
 * `Tooltip.Root`, this single delegated listener reads the attribute on hover /
 * focus and renders one floating, theme-styled tooltip — making every existing
 * `data-vc-tooltip` site work at once.
 *
 * Mounted once in the root AppShell (client-only). Pure DOM event delegation, so
 * it also covers nodes added later (no per-element wiring or MutationObserver).
 */
const SHOW_DELAY_MS = 400;
const ATTR = 'data-vc-tooltip';
const RENDERER_ATTR = 'data-vc-tooltip-renderer';
const rendererOwners = new WeakMap<Document, { count: number; previous: string | null }>();

/** Keep the CSS fallback available before hydration and after the last renderer leaves. */
function claimRenderer(document: Document) {
  const root = document.documentElement;
  const ownership = rendererOwners.get(document) ?? { count: 0, previous: root.getAttribute(RENDERER_ATTR) };
  ownership.count += 1;
  rendererOwners.set(document, ownership);
  root.setAttribute(RENDERER_ATTR, 'true');

  return () => {
    ownership.count -= 1;

    if (ownership.count > 0) {
      return;
    }

    rendererOwners.delete(document);

    // Do not overwrite a marker changed by another owner while mounted.
    if (root.getAttribute(RENDERER_ATTR) !== 'true') {
      return;
    }

    if (ownership.previous === null) {
      root.removeAttribute(RENDERER_ATTR);
    } else {
      root.setAttribute(RENDERER_ATTR, ownership.previous);
    }
  };
}

interface TooltipState {
  text: string;
  left: number;
  top: number;
}

export function GlobalTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      return;
    }

    const height = tipRef.current.getBoundingClientRect().height;
    const top = Math.max(8, Math.min(tip.top, window.innerHeight - height - 8));

    /*
     * Only commit an actual correction: the second measurement is already stable.
     * Help taller than the viewport stays complete, anchored at its upper gutter.
     */
    if (top !== tip.top) {
      setTip({ ...tip, top });
    }
  }, [tip]);

  // Element whose native `title` we stripped (to avoid a duplicate browser tooltip).
  const suppressedEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const releaseRenderer = claimRenderer(document);

    const clearShowTimer = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = undefined;
      }
    };

    const restoreNativeTitle = () => {
      const el = suppressedEl.current;

      if (el && el.dataset.vcTitleStash !== undefined) {
        if (el.getAttribute('data-vc-tooltip-hidden') !== 'true') {
          el.setAttribute('title', el.dataset.vcTitleStash);
        }

        delete el.dataset.vcTitleStash;
      }

      suppressedEl.current = null;
    };

    const suppressNativeTitle = (el: HTMLElement) => {
      const nativeTitle = el.getAttribute('title');

      if (nativeTitle) {
        el.dataset.vcTitleStash = nativeTitle;
        el.removeAttribute('title');
        suppressedEl.current = el;
      }
    };

    const hide = () => {
      clearShowTimer();
      restoreNativeTitle();
      setTip(null);
    };

    const positionFor = (el: HTMLElement, text: string): TooltipState => {
      const rect = el.getBoundingClientRect();

      /*
       * Anchor below the element, horizontally centered, clamped into the
       * viewport. Width is estimated from text length pre-measure; the rendered
       * node is clamped by max-width CSS so the estimate only needs to be rough.
       */
      const estWidth = Math.min(280, Math.max(0, window.innerWidth - 16), Math.max(40, text.length * 6.5));
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - estWidth / 2), window.innerWidth - estWidth - 8);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 36);

      return { text, left, top };
    };

    const resolveTarget = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) {
        return null;
      }

      const el = node.closest(`[${ATTR}]`);

      return el instanceof HTMLElement && el.getAttribute('data-vc-tooltip-hidden') !== 'true' ? el : null;
    };

    let dernierToucher: number | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (pointeurSansSurvol(event.pointerType)) {
        dernierToucher = Date.now();
      }

      hide();
    };

    const handlePointerOver = (event: PointerEvent) => {
      // Le survol n'existe pas au doigt : ni au toucher, ni au stylet.
      if (pointeurSansSurvol(event.pointerType)) {
        return;
      }

      const el = resolveTarget(event.target);

      if (!el) {
        return;
      }

      const text = el.getAttribute(ATTR)?.trim();

      if (!text) {
        return;
      }

      clearShowTimer();
      restoreNativeTitle();

      // Strip the native title immediately so the browser tooltip never duplicates ours.
      suppressNativeTitle(el);

      /*
       * The IDE can enrich Radix triggers too. Keep its accessible label, but
       * leave the custom rendering to Radix and suppress duplicate native help.
       */
      if (el.getAttribute('data-vc-radix-tooltip') === 'true') {
        setTip(null);
        return;
      }

      showTimer.current = setTimeout(() => {
        const currentText = el.getAttribute(ATTR)?.trim();

        if (!el.isConnected || el.getAttribute('data-vc-tooltip-hidden') === 'true' || !currentText) {
          hide();
          return;
        }

        setTip(positionFor(el, currentText));
      }, SHOW_DELAY_MS);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const from = resolveTarget(event.target);

      if (!from) {
        return;
      }

      // Ignore moves that stay within the same tooltip-bearing element.
      const to = resolveTarget(event.relatedTarget);

      if (to === from) {
        return;
      }

      hide();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const sansSurvol = typeof window.matchMedia === 'function' ? window.matchMedia('(hover: none)').matches : false;

      if (
        !infobulleAutoriseeAuFocus({
          sansSurvol,
          dernierToucherIlYA: dernierToucher === null ? null : Date.now() - dernierToucher,
        })
      ) {
        return;
      }

      const el = resolveTarget(event.target);
      const text = el?.getAttribute(ATTR)?.trim();

      if (el && text) {
        clearShowTimer();
        restoreNativeTitle();
        suppressNativeTitle(el);

        if (el.getAttribute('data-vc-radix-tooltip') === 'true') {
          setTip(null);
          return;
        }

        setTip(positionFor(el, text));
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    // A mouse click can focus its trigger after pointerdown and reopen help.
    document.addEventListener('click', hide, true);
    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', hide, true);

    // Any scroll/resize invalidates the anchored position — just dismiss.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide, true);

    /*
     * IDE shortcuts can stop propagation during window capture. Dismiss help
     * on that same target without consuming the key or changing its action.
     */
    window.addEventListener('keydown', hide, true);

    return () => {
      releaseRenderer();
      clearShowTimer();
      restoreNativeTitle();
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', hide, true);
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide, true);
      window.removeEventListener('keydown', hide, true);
    };
  }, []);

  if (!tip) {
    return null;
  }

  return (
    <div
      ref={tipRef}
      role="tooltip"
      className="pointer-events-none fixed z-[11003] max-w-[280px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-1 text-xs leading-snug text-bolt-elements-textPrimary shadow-lg"
      style={{ left: tip.left, top: tip.top, maxWidth: 'min(280px, calc(100vw - 16px))', overflowWrap: 'anywhere' }}
    >
      {tip.text}
    </div>
  );
}
