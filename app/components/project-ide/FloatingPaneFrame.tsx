import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface FloatingPaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloatingPaneFrameProps {
  paneId: string;
  title: string;
  bounds: FloatingPaneBounds;
  zIndex: number;
  active: boolean;
  onBoundsChange: (bounds: FloatingPaneBounds) => void;
  onDock: () => void;
  onFocus: () => void;
  children: React.ReactNode;
}

const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;

type DragMode = 'move' | 'resize';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  origin: FloatingPaneBounds;
}

/**
 * RPL-IDE-001.3 — a pane that has been popped out of the docked tree. It floats
 * over the workspace canvas, can be dragged by its header and resized from the
 * bottom-right corner, and docks back to its original position via the header
 * button (the engine restores the exact split it came from). Bounds are clamped
 * to the parent canvas so a floating pane can never be dragged off-screen.
 */
export function FloatingPaneFrame({
  paneId,
  title,
  bounds,
  zIndex,
  active,
  onBoundsChange,
  onDock,
  onFocus,
  children,
}: FloatingPaneFrameProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback((next: FloatingPaneBounds): FloatingPaneBounds => {
    const parent = frameRef.current?.parentElement;
    const maxWidth = parent?.clientWidth ?? next.width;
    const maxHeight = parent?.clientHeight ?? next.height;

    const width = Math.max(MIN_WIDTH, Math.min(next.width, maxWidth));
    const height = Math.max(MIN_HEIGHT, Math.min(next.height, maxHeight));
    const x = Math.max(0, Math.min(next.x, Math.max(0, maxWidth - width)));
    const y = Math.max(0, Math.min(next.y, Math.max(0, maxHeight - height)));

    return { x, y, width, height };
  }, []);

  const beginDrag = useCallback(
    (mode: DragMode) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onFocus();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      dragRef.current = {
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: bounds,
      };
      setDragging(true);
    },
    [bounds, onFocus],
  );

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const handleMove = (event: PointerEvent) => {
      const state = dragRef.current;

      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;

      if (state.mode === 'move') {
        onBoundsChange(clamp({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy }));
      } else {
        onBoundsChange(clamp({ ...state.origin, width: state.origin.width + dx, height: state.origin.height + dy }));
      }
    };

    const endDrag = () => {
      dragRef.current = null;
      setDragging(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, clamp, onBoundsChange]);

  return (
    <div
      ref={frameRef}
      className="bolt-project-floating-pane"
      role="dialog"
      aria-label={`Floating pane: ${title}`}
      data-pane-id={paneId}
      data-active={active ? 'true' : undefined}
      data-testid={`floating-pane-${paneId}`}
      style={{
        position: 'absolute',
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        zIndex,
      }}
      onMouseDownCapture={onFocus}
    >
      <div className="bolt-project-floating-pane-header" onPointerDown={beginDrag('move')}>
        <span className="bolt-project-floating-pane-title">
          <span className="i-ph:picture-in-picture" aria-hidden />
          {title}
        </span>
        <button
          type="button"
          className="bolt-project-floating-pane-dock"
          aria-label="Dock pane"
          title="Dock pane"
          data-testid={`dock-floating-pane-${paneId}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDock}
        >
          <span className="i-ph:sidebar-simple" aria-hidden />
          Dock
        </button>
      </div>
      <div className="bolt-project-floating-pane-body">{children}</div>
      <div
        className="bolt-project-floating-pane-resize"
        role="separator"
        aria-label="Resize floating pane"
        aria-orientation="vertical"
        data-testid={`resize-floating-pane-${paneId}`}
        onPointerDown={beginDrag('resize')}
      />
    </div>
  );
}
