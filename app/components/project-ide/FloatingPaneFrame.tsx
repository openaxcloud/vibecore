import { GripHorizontal, PanelTopClose } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import styles from './FloatingPaneFrame.module.scss';
import {
  clampFloatingPaneBounds,
  type FloatingPaneBounds,
  type FloatingPaneContainerSize,
} from '~/lib/floating-pane-bounds';

function containerSizeFor(element: HTMLElement): FloatingPaneContainerSize {
  const parent = element.parentElement;

  return {
    width: parent?.clientWidth ?? element.ownerDocument.documentElement.clientWidth,
    height: parent?.clientHeight ?? element.ownerDocument.documentElement.clientHeight,
  };
}

export function FloatingPaneFrame({
  paneId,
  title,
  bounds,
  zIndex,
  active,
  children,
  onBoundsChange,
  onDock,
  onFocus,
}: {
  paneId: string;
  title: string;
  bounds: FloatingPaneBounds;
  zIndex: number;
  active: boolean;
  children: ReactNode;
  onBoundsChange: (bounds: FloatingPaneBounds) => void;
  onDock: () => void;
  onFocus: () => void;
}) {
  const frameRef = useRef<HTMLElement>(null);
  const boundsRef = useRef(bounds);

  boundsRef.current = bounds;

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return undefined;
    }

    const clampToContainer = () => {
      const current = boundsRef.current;
      const next = clampFloatingPaneBounds(current, containerSizeFor(frame));

      if (
        next.x !== current.x ||
        next.y !== current.y ||
        next.width !== current.width ||
        next.height !== current.height
      ) {
        boundsRef.current = next;
        onBoundsChange(next);
      }
    };

    clampToContainer();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToContainer);

      return () => window.removeEventListener('resize', clampToContainer);
    }

    const observer = new ResizeObserver(clampToContainer);

    observer.observe(frame.parentElement ?? frame.ownerDocument.documentElement);

    return () => observer.disconnect();
  }, [onBoundsChange]);

  const updateByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, mode: 'move' | 'resize') => {
    const frame = frameRef.current;

    if (!frame || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    onFocus();

    const step = event.shiftKey ? 48 : 16;
    const horizontal = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const vertical = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;

    onBoundsChange(
      clampFloatingPaneBounds(
        mode === 'move'
          ? { ...bounds, x: bounds.x + horizontal, y: bounds.y + vertical }
          : { ...bounds, width: bounds.width + horizontal, height: bounds.height + vertical },
        containerSizeFor(frame),
      ),
    );
  };

  const startPointerOperation = (event: ReactPointerEvent<HTMLButtonElement>, mode: 'move' | 'resize') => {
    if (event.button !== 0) {
      return;
    }

    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    event.preventDefault();
    onFocus();

    const control = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = bounds;
    const container = containerSizeFor(frame);

    control.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      onBoundsChange(
        clampFloatingPaneBounds(
          mode === 'move'
            ? { ...startBounds, x: startBounds.x + deltaX, y: startBounds.y + deltaY }
            : { ...startBounds, width: startBounds.width + deltaX, height: startBounds.height + deltaY },
          container,
        ),
      );
    };

    const finishPointerOperation = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) {
        return;
      }

      control.removeEventListener('pointermove', handlePointerMove);
      control.removeEventListener('pointerup', finishPointerOperation);
      control.removeEventListener('pointercancel', finishPointerOperation);

      if (control.hasPointerCapture(pointerId)) {
        control.releasePointerCapture(pointerId);
      }
    };

    control.addEventListener('pointermove', handlePointerMove);
    control.addEventListener('pointerup', finishPointerOperation);
    control.addEventListener('pointercancel', finishPointerOperation);
  };

  return (
    <section
      ref={frameRef}
      className={styles.frame}
      data-active={active ? 'true' : 'false'}
      data-pane-id={paneId}
      data-testid="floating-pane"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        zIndex,
      }}
      aria-label={`Floating pane: ${title}`}
      onPointerDown={onFocus}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={`Move floating pane ${title}`}
          title="Drag to move. Arrow keys move by 16px; hold Shift for 48px."
          data-testid={`floating-pane-move-${paneId}`}
          onPointerDown={(event) => startPointerOperation(event, 'move')}
          onKeyDown={(event) => updateByKeyboard(event, 'move')}
        >
          <GripHorizontal aria-hidden />
          <span>Floating pane</span>
        </button>
        <strong title={title}>{title}</strong>
        <button
          type="button"
          className={styles.dockButton}
          aria-label={`Dock pane ${title}`}
          data-testid={`dock-floating-pane-${paneId}`}
          onClick={onDock}
        >
          <PanelTopClose aria-hidden />
          <span>Dock</span>
        </button>
      </header>
      <div className={styles.content}>{children}</div>
      <button
        type="button"
        className={styles.resizeHandle}
        aria-label={`Resize floating pane ${title}`}
        title="Drag to resize. Arrow keys resize by 16px; hold Shift for 48px."
        data-testid={`floating-pane-resize-${paneId}`}
        onPointerDown={(event) => startPointerOperation(event, 'resize')}
        onKeyDown={(event) => updateByKeyboard(event, 'resize')}
      />
    </section>
  );
}
