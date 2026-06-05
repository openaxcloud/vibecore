import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

interface DropdownItemProps {
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
}

export const DropdownItem = ({ children, onSelect, className }: DropdownItemProps) => (
  <DropdownMenu.Item
    className={classNames(
      'relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
      'text-bolt-elements-textPrimary hover:text-bolt-elements-textPrimary',
      'hover:bg-bolt-elements-background-depth-3',
      'transition-colors cursor-pointer',
      'outline-none',
      className,
    )}
    onSelect={onSelect}
  >
    {children}
  </DropdownMenu.Item>
);

export const DropdownSeparator = () => <DropdownMenu.Separator className="h-px bg-bolt-elements-borderColor my-1" />;

export const Dropdown = ({ trigger, children, align = 'end', sideOffset = 5 }: DropdownProps) => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={classNames(
            'min-w-[min(220px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-24px))] overflow-auto rounded-lg p-2',
            'bg-bolt-elements-background-depth-2',
            'border border-bolt-elements-borderColor',
            'shadow-lg',
            'animate-in fade-in-80 zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
            'data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2',
            'data-[side=top]:slide-in-from-bottom-2',

            /*
             * Above the dialog tier (z-[9999]/z-[10000]): this content is portaled
             * to <body>, so at z-1000 a dropdown opened from inside a modal rendered
             * behind the modal backdrop.
             */
            'z-[10010]',
          )}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={12}
          hideWhenDetached
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
