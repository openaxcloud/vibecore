import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLanguage } from './Dialog';
import { infobulleAutoriseeAuFocus, pointeurSansSurvol } from './infobulle-tactile';
import { getDataSettingsCopy } from '~/lib/i18n/catalogs/search-data-settings';

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
  anchor: HTMLElement;
  oversized?: boolean;
  path?: string;
}

export function GlobalTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [help, setHelp] = useState<TooltipState | null>(null);
  const titleId = useId();
  const language = useDialogLanguage();

  const sharedCopy = getDataSettingsCopy(language).sharedDialog;
  const copy = sharedCopy.fullHelp;

  const tipStateRef = useRef(tip);
  const helpRef = useRef(help);
  tipStateRef.current = tip;
  helpRef.current = help;

  const readingRef = useRef<HTMLDivElement>(null);
  const skipFocusRef = useRef<HTMLElement | null>(null);

  const closeHelp = (restore: boolean) => {
    const current = helpRef.current;
    setHelp(null);

    if (restore && current?.anchor.isConnected && current.path === window.location.pathname) {
      skipFocusRef.current = current.anchor;
      current.anchor.focus({ preventScroll: true });
    }
  };

  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openHelp = (current: TooltipState) => {
    if (!current.anchor.isConnected) {
      return;
    }

    if (showTimer.current !== undefined) {
      clearTimeout(showTimer.current);
      showTimer.current = undefined;
    }

    setHelp({ ...current, path: window.location.pathname });
    setTip(null);
  };

  const tipRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      return;
    }

    const height = tipRef.current.getBoundingClientRect().height;
    const top = Math.max(8, Math.min(tip.top, window.innerHeight - height - 8));

    const oversized =
      tip.oversized || tipRef.current.scrollHeight > tipRef.current.clientHeight || height > window.innerHeight - 16;

    // Once detected, measure the compact action instead of oscillating between surfaces.
    if (top !== tip.top || Boolean(oversized) !== Boolean(tip.oversized)) {
      setTip({ ...tip, top, oversized });
    }
  }, [tip]);

  useEffect(() => {
    if (!help) {
      return undefined;
    }

    readingRef.current?.focus();

    const dismissStaleHelp = () => {
      setHelp(null);
    };
    const observer = new MutationObserver(() => {
      if (!help.anchor.isConnected || help.path !== window.location.pathname) {
        dismissStaleHelp();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const checkRoute = () => {
      if (help.path !== window.location.pathname) {
        dismissStaleHelp();
      }
    };
    window.addEventListener('popstate', checkRoute);

    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', checkRoute);
    };
  }, [help]);

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

      return { text, left, top, anchor: el };
    };

    const resolveTarget = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) {
        return null;
      }

      const el = node.closest(`[${ATTR}]`);

      return el instanceof HTMLElement && el.getAttribute('data-vc-tooltip-hidden') !== 'true' ? el : null;
    };

    let dernierToucher: number | null = null;

    const isHelpTarget = (target: EventTarget | null) =>
      target instanceof Node &&
      ((tipStateRef.current?.oversized && tipRef.current?.contains(target)) ||
        (target instanceof Element && Boolean(target.closest('[data-vc-full-help]'))));
    const hideOutsideHelp = (event: Event) => {
      if (!isHelpTarget(event.target)) {
        hide();
      }
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (helpRef.current && isHelpTarget(event.target) && !isHelpTarget(event.relatedTarget)) {
        closeHelp(false);
      }

      if (!isHelpTarget(event.relatedTarget)) {
        hide();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = tipStateRef.current;

      if (
        event.key === 'F1' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        current?.oversized &&
        document.activeElement === current.anchor
      ) {
        event.preventDefault();
        openHelp(current);

        return;
      }

      if (helpRef.current) {
        if (event.key === 'Escape') {
          closeHelp(true);
        }

        return;
      }

      if (event.key === 'Escape' || !isHelpTarget(event.target)) {
        hide();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (helpRef.current && !isHelpTarget(event.target)) {
        closeHelp(false);
      }

      if (isHelpTarget(event.target)) {
        return;
      }

      if (pointeurSansSurvol(event.pointerType)) {
        dernierToucher = Date.now();
      }

      hide();
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (helpRef.current) {
        return;
      }

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

      if (tipStateRef.current?.oversized || to === from || isHelpTarget(event.relatedTarget)) {
        return;
      }

      hide();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target === skipFocusRef.current) {
        skipFocusRef.current = null;
        return;
      }

      if (helpRef.current || isHelpTarget(event.target)) {
        return;
      }

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
    document.addEventListener('click', hideOutsideHelp, true);
    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Any scroll/resize invalidates the anchored position — just dismiss.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide, true);

    /*
     * IDE shortcuts can stop propagation during window capture. Dismiss help
     * on that same target without consuming the key or changing its action.
     */
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      releaseRenderer();
      clearShowTimer();
      restoreNativeTitle();
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', hideOutsideHelp, true);
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  if (help) {
    return createPortal(
      <div
        role="dialog"
        data-state="open"
        aria-modal={false}
        data-vc-full-help
        aria-labelledby={titleId}
        className="fixed z-[11003] flex flex-col rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-bolt-elements-textPrimary shadow-lg"
        style={{
          margin: 0,
          left: 8,
          top: 8,
          width: 'min(520px, calc(100vw - 16px))',
          maxHeight: 'calc(100dvh - 16px)',
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 id={titleId} className="font-semibold">
            {copy.title}
          </h2>
          <button type="button" className="min-h-10 rounded px-2" onClick={() => closeHelp(true)}>
            {sharedCopy.close}
          </button>
        </div>
        <div
          ref={readingRef}
          role="region"
          aria-label={copy.text}
          tabIndex={0}
          className="min-h-0 overflow-auto whitespace-pre-wrap"
          style={{ overflowWrap: 'anywhere' }}
        >
          {help.text}
        </div>
      </div>,
      document.body,
    );
  }

  if (!tip) {
    return null;
  }

  if (tip.oversized) {
    return (
      <div
        ref={tipRef}
        className="fixed z-[11003] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-bolt-elements-textPrimary shadow-lg"
        style={{ left: tip.left, top: tip.top, maxWidth: 'calc(100vw - 16px)', overflowWrap: 'anywhere' }}
      >
        <button type="button" className="min-h-10 text-left" aria-haspopup="dialog" onClick={() => openHelp(tip)}>
          {copy.read}
        </button>
      </div>
    );
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
