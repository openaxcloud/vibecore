import { useEffect, useState } from 'react';

const IDE_SHELL = '.bolt-project-ide-shell, .bolt-responsive-ide';

/** Scope notifications to an actually mounted IDE, including legacy chat routes. */
export function useIdeToastLayout() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompact(viewport.matches && Boolean(document.querySelector(IDE_SHELL)));

    const observer = new MutationObserver((changes) => {
      // Ignore streamed text changes; only a shell insertion/removal can change scope.
      if (
        changes.some((change) =>
          [...change.addedNodes, ...change.removedNodes].some(
            (node) => node instanceof Element && (node.matches(IDE_SHELL) || node.querySelector(IDE_SHELL)),
          ),
        )
      ) {
        update();
      }
    });

    update();
    viewport.addEventListener('change', update);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      viewport.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return compact ? installToastFocusRepair() : undefined;
  }, [compact]);

  return compact;
}

function installToastFocusRepair() {
  let frame = 0;

  const resizeObserver = new ResizeObserver(schedule);

  function repair() {
    frame = 0;

    const active = document.activeElement;

    if (!(active instanceof HTMLElement)) {
      return;
    }

    const list = active.closest('.Toastify__toast-container.vc-ide-compact-toasts');

    if (!(list instanceof HTMLElement) || !document.querySelector('.bolt-project-ide-shell, .bolt-responsive-ide')) {
      return;
    }

    const box = list.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    const top = box.top + list.clientTop;
    const bottom = top + list.clientHeight;
    const delta = target.top < top ? target.top - top : target.bottom > bottom ? target.bottom - bottom : 0;

    if (delta) {
      list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + delta));
    }
  }

  function schedule() {
    if (!frame) {
      frame = requestAnimationFrame(repair);
    }
  }

  function focused() {
    resizeObserver.disconnect();

    const active = document.activeElement;
    const list = active instanceof Element && active.closest('.Toastify__toast-container');

    if (list instanceof HTMLElement) {
      resizeObserver.observe(list);
    }

    schedule();
  }
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', focused);
  focused();

  return () => {
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', focused);
    resizeObserver.disconnect();
    cancelAnimationFrame(frame);
  };
}
