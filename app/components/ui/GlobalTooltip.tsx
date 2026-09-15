import { useEffect, useRef, useState } from 'react';
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

interface TooltipState {
  text: string;
  left: number;
  top: number;
}

export function GlobalTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipRef = useRef<HTMLDivElement | null>(null);

  // Element whose native `title` we stripped (to avoid a duplicate browser tooltip).
  const suppressedEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = undefined;
      }
    };

    const restoreNativeTitle = () => {
      const el = suppressedEl.current;

      if (el && el.dataset.vcTitleStash !== undefined) {
        el.setAttribute('title', el.dataset.vcTitleStash);
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
      const estWidth = Math.min(280, Math.max(40, text.length * 6.5));
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - estWidth / 2), window.innerWidth - estWidth - 8);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 36);

      return { text, left, top };
    };

    const resolveTarget = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) {
        return null;
      }

      const el = node.closest(`[${ATTR}]`);

      return el instanceof HTMLElement ? el : null;
    };

    let dernierToucher: number | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (pointeurSansSurvol(event.pointerType)) {
        dernierToucher = Date.now();
        hide();
      }
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
      showTimer.current = setTimeout(() => setTip(positionFor(el, text)), SHOW_DELAY_MS);
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
        setTip(positionFor(el, text));
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', hide, true);

    // Any scroll/resize invalidates the anchored position — just dismiss.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide, true);
    document.addEventListener('keydown', hide, true);

    return () => {
      clearShowTimer();
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide, true);
      document.removeEventListener('keydown', hide, true);
    };
  }, []);

  if (!tip) {
    return null;
  }

  return (
    <div
      ref={tipRef}
      role="tooltip"
      className="pointer-events-none fixed z-[10000] max-w-[280px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-1 text-xs leading-snug text-bolt-elements-textPrimary shadow-lg"
      style={{ left: tip.left, top: tip.top }}
    >
      {tip.text}
    </div>
  );
}
