import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { PropsWithChildren, ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

type PopoverSide = 'top' | 'right' | 'bottom' | 'left';
type PopoverAlign = 'center' | 'start' | 'end';

interface PopoverProps {
  align?: PopoverAlign;
  arrowClassName?: string;
  contentClassName?: string;
  side?: PopoverSide;
  sideOffset?: number;
  testId?: string;
  trigger: ReactNode;
}

export default function Popover({
  children,
  contentClassName,
  arrowClassName,
  trigger,
  side,
  align,
  sideOffset = 10,
  testId,
}: PropsWithChildren<PopoverProps>) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Anchor />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          avoidCollisions
          collisionPadding={16}
          data-testid={testId}
          hideWhenDetached
          sideOffset={sideOffset}
          side={side}
          className={classNames(
            'bolt-popover-content z-workbench max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 text-bolt-elements-item-contentAccent shadow-xl',
            contentClassName,
          )}
        >
          {children}
          <PopoverPrimitive.Arrow
            className={classNames('bolt-popover-arrow fill-bolt-elements-background-depth-2', arrowClassName)}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
