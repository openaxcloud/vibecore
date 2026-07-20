export interface FloatingPaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingPaneContainerSize {
  width: number;
  height: number;
}

const MIN_FLOATING_PANE_WIDTH = 280;
const MIN_FLOATING_PANE_HEIGHT = 220;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clampFloatingPaneBounds(
  bounds: FloatingPaneBounds,
  container: FloatingPaneContainerSize,
): FloatingPaneBounds {
  const containerWidth = Math.max(1, finiteOr(container.width, 1));
  const containerHeight = Math.max(1, finiteOr(container.height, 1));
  const minimumWidth = Math.min(MIN_FLOATING_PANE_WIDTH, containerWidth);
  const minimumHeight = Math.min(MIN_FLOATING_PANE_HEIGHT, containerHeight);
  const width = Math.min(containerWidth, Math.max(minimumWidth, finiteOr(bounds.width, minimumWidth)));
  const height = Math.min(containerHeight, Math.max(minimumHeight, finiteOr(bounds.height, minimumHeight)));

  return {
    x: Math.min(Math.max(0, finiteOr(bounds.x, 0)), Math.max(0, containerWidth - width)),
    y: Math.min(Math.max(0, finiteOr(bounds.y, 0)), Math.max(0, containerHeight - height)),
    width,
    height,
  };
}
