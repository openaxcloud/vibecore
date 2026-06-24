import * as React from 'react';
import { classNames } from '~/utils/classNames';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

/*
 * Clamp the progress value to a valid percentage in [0, 100]. Guards against
 * out-of-range input (which would slide the fill off-track) and non-finite
 * values like NaN (e.g. ModelCard's current/total when total is 0), which would
 * otherwise emit an invalid `translateX(-NaN%)` that the browser drops, leaving
 * the bar stuck at 100%.
 */
export function clampProgress(value?: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value as number)) : 0;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value, ...props }, ref) => {
  const pct = clampProgress(value);

  return (
    <div
      ref={ref}
      className={classNames(
        'relative h-2 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3',
        className,
      )}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-bolt-elements-textPrimary transition-all"
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </div>
  );
});
Progress.displayName = 'Progress';

export { Progress };
