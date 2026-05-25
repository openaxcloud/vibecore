import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ForwardedRef, type ReactElement } from 'react';
import { classNames } from '~/utils/classNames';

// Original WithTooltip component
interface WithTooltipProps {
  tooltip: React.ReactNode;
  children: ReactElement;
  sideOffset?: number;
  className?: string;
  arrowClassName?: string;
  tooltipStyle?: React.CSSProperties;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;
  delay?: number;
}

const WithTooltip = forwardRef(
  (
    {
      tooltip,
      children,
      sideOffset = 5,
      className = '',
      arrowClassName = '',
      tooltipStyle = {},
      position = 'top',
      maxWidth = 250,
      delay = 0,
    }: WithTooltipProps,
    _ref: ForwardedRef<HTMLElement>,
  ) => {
    return (
      <TooltipPrimitive.Provider>
        <TooltipPrimitive.Root delayDuration={delay}>
          <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side={position}
              className={`
                z-[2000]
                px-2.5
                py-1.5
                max-h-[300px]
                select-none
                rounded-md
                border
                text-sm
                leading-tight
                shadow-lg
                animate-in
                fade-in-0
                zoom-in-95
                data-[state=closed]:animate-out
                data-[state=closed]:fade-out-0
                data-[state=closed]:zoom-out-95
                ${className}
              `}
              sideOffset={sideOffset}
              style={{
                maxWidth,
                background: 'var(--vc-ui-tooltip-bg)',
                borderColor: 'var(--vc-ui-tooltip-border)',
                color: 'var(--vc-ide-text-primary)',
                ...tooltipStyle,
              }}
            >
              <div className="break-words">{tooltip}</div>
              <TooltipPrimitive.Arrow
                className={`
                  ${arrowClassName}
                `}
                style={{ fill: 'var(--vc-ui-tooltip-bg)' }}
                width={12}
                height={6}
              />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    );
  },
);

// New Tooltip component with simpler API
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 500,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root delayDuration={delayDuration}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            className={classNames(
              'z-[2000] max-w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-md border px-3 py-1.5 text-xs leading-tight shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
              className,
            )}
            sideOffset={5}
            style={{
              background: 'var(--vc-ui-tooltip-bg)',
              borderColor: 'var(--vc-ui-tooltip-border)',
              color: 'var(--vc-ide-text-primary)',
            }}
          >
            <span className="block break-words">{content}</span>
            <TooltipPrimitive.Arrow style={{ fill: 'var(--vc-ui-tooltip-bg)' }} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default WithTooltip;
