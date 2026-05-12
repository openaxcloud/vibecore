import { useRef, type TouchEvent } from 'react';

export interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  preventScroll?: boolean;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  preventScroll = false,
}: SwipeGestureOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchEnd = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = {
      x: event.targetTouches[0].clientX,
      y: event.targetTouches[0].clientY,
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!touchStart.current) {
      return;
    }

    touchEnd.current = {
      x: event.targetTouches[0].clientX,
      y: event.targetTouches[0].clientY,
    };

    if (!preventScroll) {
      return;
    }

    const deltaX = Math.abs(touchEnd.current.x - touchStart.current.x);
    const deltaY = Math.abs(touchEnd.current.y - touchStart.current.y);

    if (deltaX > deltaY) {
      event.preventDefault();
    }
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) {
      return;
    }

    const deltaX = touchStart.current.x - touchEnd.current.x;
    const deltaY = touchStart.current.y - touchEnd.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      if (deltaX > 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    }

    if (absDeltaY > absDeltaX && absDeltaY > threshold) {
      if (deltaY > 0) {
        onSwipeUp?.();
      } else {
        onSwipeDown?.();
      }
    }

    touchStart.current = null;
    touchEnd.current = null;
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}
