import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useLayoutHandoffEffect } from './ide-layout-handoff';

import { classNames } from '~/utils/classNames';

export interface HeaderOverflowMenuProps {
  /** Menu rows — typically <button className="bolt-header-overflow-item">…</button>. */
  children: ReactNode;
  label?: string;
  className?: string;
  state?: { open: boolean; focusedIndex: number };
  onStateChange?: (state: { open: boolean; focusedIndex: number }) => void;
}

/**
 * A compact "…" overflow dropdown for the agent-panel header. Collapses the
 * lower-frequency icon actions (copy, clear, export, theme, settings) behind a
 * single trigger for a cleaner, Replit-style header — without removing any
 * action (they all live inside the menu). Self-contained: manages its own open
 * state + click-outside/Escape, so the host header keeps its existing hooks.
 */
export function HeaderOverflowMenu({
  children,
  label = 'More actions',
  className,
  state: controlledState,
  onStateChange,
}: HeaderOverflowMenuProps) {
  const [localState, setLocalState] = useState({ open: false, focusedIndex: 0 });
  const state = controlledState ?? localState;
  const { open } = state;
  const setState = onStateChange ?? setLocalState;

  const setOpen = (next: boolean | ((previous: boolean) => boolean)) => {
    const nextOpen = typeof next === 'function' ? next(open) : next;
    setState({ open: nextOpen, focusedIndex: nextOpen ? state.focusedIndex : 0 });
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last' | number>(state.focusedIndex);
  const menuId = useId();

  const menuButtons = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useLayoutHandoffEffect(() => {
    if (open) {
      const buttons = menuButtons();

      const index =
        initialFocus.current === 'last'
          ? buttons.length - 1
          : initialFocus.current === 'first'
            ? 0
            : initialFocus.current;
      (buttons[index] ?? buttons[0])?.focus();
    }
  }, [open]);

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
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreFocus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);

    // Close this menu before the IDE-wide overlay.close keybinding consumes Escape.
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={classNames('relative inline-flex', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="bolt-project-ide-icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        title={label}
        onClick={() => {
          initialFocus.current = 'first';
          setOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={15} strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <div
          ref={menuRef}
          onFocusCapture={() => {
            const focusedIndex = menuButtons().findIndex((button) => button === document.activeElement);

            if (focusedIndex >= 0 && focusedIndex !== state.focusedIndex) {
              setState({ open: true, focusedIndex });
            }
          }}
          id={menuId}
          role="menu"
          aria-label={label}
          className="bolt-header-overflow-menu absolute right-0 top-full z-50 mt-1 flex w-56 flex-col gap-0.5 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1.5 shadow-xl"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) {
              closeAndRestoreFocus();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeAndRestoreFocus();

              return;
            }

            if (event.key === 'Tab') {
              // Let the browser continue from the trigger after the menu closes.
              closeAndRestoreFocus();
              return;
            }

            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            const buttons = menuButtons();
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);

            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;

            buttons[next]?.focus();
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
