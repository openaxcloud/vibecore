import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cibleFeuilleMobile } from './feuille-mobile';

/** A stable portal preserves child dialogs while escaping the panel's clipping ancestors. */
export function ComposerToolsPortal({
  anchorRef,
  menuRef,
  children,
  focusOnMount = false,
}: {
  focusOnMount?: boolean;
  anchorRef: RefObject<HTMLDivElement>;
  menuRef: RefObject<HTMLDivElement>;
  children: ReactElement<{ style?: CSSProperties }>;
}) {
  const initialFocusDone = useRef(false);
  const [portal, setPortal] = useState<HTMLDivElement>();
  const [position, setPosition] = useState<CSSProperties>();

  useEffect(() => {
    const node = document.createElement('div');
    node.style.display = 'contents';
    setPortal(node);

    return () => {
      node.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (!portal) {
      return undefined;
    }

    const anchor = anchorRef.current;
    const menu = menuRef.current;
    const panel = anchor?.closest('.bolt-project-agent-panel');

    if (!anchor || !menu) {
      return undefined;
    }

    let frame = 0;

    const update = () => {
      frame = 0;

      const mobile = cibleFeuilleMobile(document);
      const host = mobile ?? anchor.closest<HTMLElement>('.bolt-project-ide-shell') ?? anchor;

      if (portal.parentElement !== host) {
        const active = document.activeElement;
        const ownedFocus = active instanceof HTMLElement && portal.contains(active);
        host.appendChild(portal);

        if (ownedFocus && active.isConnected && document.activeElement !== active) {
          active.focus({ preventScroll: true });
        }
      }

      if (!initialFocusDone.current) {
        initialFocusDone.current = true;

        if (focusOnMount) {
          menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
        }
      }

      if (mobile || host === anchor) {
        setPosition(undefined);
        return;
      }

      const bounds = anchor.getBoundingClientRect();
      const panelWidth = panel?.getBoundingClientRect().width ?? window.innerWidth;
      const width = Math.max(0, Math.min(260, panelWidth - 16, window.innerWidth - 16));
      const above = Math.min(window.innerHeight - 16, bounds.top - 16);
      const below = Math.min(window.innerHeight - 16, window.innerHeight - bounds.bottom - 16);
      const opensAbove = above >= Math.min(420, menu.scrollHeight) || above >= below;
      const maxHeight = Math.max(44, Math.min(420, opensAbove ? above : below));
      const height = Math.min(menu.scrollHeight, maxHeight);

      const next: CSSProperties = {
        position: 'fixed',
        left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)),
        top: Math.max(
          8,
          Math.min(window.innerHeight - height - 8, opensAbove ? bounds.top - height - 8 : bounds.bottom + 8),
        ),
        bottom: 'auto',
        width,
        minWidth: 0,
        maxWidth: width,
        maxHeight,
        visibility: 'visible',
      };
      setPosition((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };

    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    observer?.observe(anchor);
    observer?.observe(menu);

    if (panel) {
      observer?.observe(panel);
    }

    update();
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  }, [anchorRef, menuRef, portal, focusOnMount]);

  return portal ? createPortal(cloneElement(children, { style: position }), portal) : null;
}
