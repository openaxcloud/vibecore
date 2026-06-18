import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { classNames } from '~/utils/classNames';

export interface HeaderOverflowMenuProps {
  /** Menu rows — typically <button className="bolt-header-overflow-item">…</button>. */
  children: ReactNode;
  label?: string;
  className?: string;
}

/**
 * A compact "…" overflow dropdown for the agent-panel header. Collapses the
 * lower-frequency icon actions (copy, clear, export, theme, settings) behind a
 * single trigger for a cleaner, Replit-style header — without removing any
 * action (they all live inside the menu). Self-contained: manages its own open
 * state + click-outside/Escape, so the host header keeps its existing hooks.
 */
export function HeaderOverflowMenu({ children, label = 'More actions', className }: HeaderOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={classNames('relative inline-flex', className)}>
      <button
        type="button"
        className="bolt-project-ide-icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreHorizontal size={15} strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="bolt-header-overflow-menu absolute right-0 top-full z-50 mt-1 flex w-56 flex-col gap-0.5 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1.5 shadow-xl"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
