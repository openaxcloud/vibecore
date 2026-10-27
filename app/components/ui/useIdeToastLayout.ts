import { useEffect, useState } from 'react';

const IDE_SHELL = '.bolt-project-ide-shell, .bolt-responsive-ide';
const AGENT_PANEL = '.bolt-project-agent-panel';

/** Scope notifications to an actually mounted IDE, including legacy chat routes. */
export function useIdeToastLayout() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 1023px)');

    let observedPanel: Element | null | undefined;
    let observedShell: Element | null | undefined;

    const geometry = new ResizeObserver(() => update());
    const propertyNames = ['--vc-ide-toast-left', '--vc-ide-toast-width', '--vc-ide-toast-top'];
    const clearGeometry = () => propertyNames.forEach((name) => document.documentElement.style.removeProperty(name));

    const update = () => {
      const shell = document.querySelector(IDE_SHELL);
      const panel = shell?.querySelector(AGENT_PANEL) ?? null;

      if (panel !== observedPanel || shell !== observedShell) {
        geometry.disconnect();
        observedPanel = panel;
        observedShell = shell;

        if (panel) {
          geometry.observe(panel);
        }

        if (shell) {
          geometry.observe(shell);
        }
      }

      const box = panel?.getBoundingClientRect();
      const left = Math.max(8, box ? box.left + 8 : 8);
      const availableWidth = box ? Math.min(box.right - 8, window.innerWidth - 8) - left : 0;

      const visiblePanel =
        box && availableWidth >= 80 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
      setCompact(Boolean(shell));
      clearGeometry();

      if (!viewport.matches && visiblePanel) {
        document.documentElement.style.setProperty('--vc-ide-toast-left', `${left}px`);
        document.documentElement.style.setProperty('--vc-ide-toast-width', `${Math.min(380, availableWidth)}px`);
        document.documentElement.style.setProperty(
          '--vc-ide-toast-top',
          `${Math.max(60, Math.min(box.top + 8, window.innerHeight - 240))}px`,
        );
      }
    };

    const observer = new MutationObserver((changes) => {
      // Ignore streamed text changes; observe shell/pane insertion and removal only.
      if (
        changes.some((change) =>
          [...change.addedNodes, ...change.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches(`${IDE_SHELL}, ${AGENT_PANEL}`) || node.querySelector(`${IDE_SHELL}, ${AGENT_PANEL}`)),
          ),
        )
      ) {
        update();
      }
    });

    update();
    viewport.addEventListener('change', update);
    window.addEventListener('resize', update);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      viewport.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      geometry.disconnect();
      clearGeometry();
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
      /*
       * Browsers may quantize scrollTop: round toward the hidden edge so a
       * fractional remainder does not leave the focused control clipped.
       */
      const next = delta > 0 ? Math.ceil(list.scrollTop + delta) : Math.floor(list.scrollTop + delta);
      list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, next));
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
