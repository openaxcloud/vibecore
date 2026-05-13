import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { classNames } from '~/utils/classNames';

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={classNames(
      'inline-flex items-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1 shadow-sm',
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const toggleGroupItemVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium outline-none transition-colors',
  {
    variants: {
      variant: {
        default:
          'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary data-[state=on]:bg-bolt-elements-item-backgroundAccent data-[state=on]:text-bolt-elements-item-contentAccent',
        enterprise:
          'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary data-[state=on]:bg-bolt-elements-background-depth-3 data-[state=on]:text-bolt-elements-textPrimary data-[state=on]:shadow-sm',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-9 px-3 text-sm',
        lg: 'h-10 px-4 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

type ToggleGroupItemProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleGroupItemVariants>;

const ToggleGroupItem = React.forwardRef<React.ElementRef<typeof ToggleGroupPrimitive.Item>, ToggleGroupItemProps>(
  ({ className, variant, size, ...props }, ref) => (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={classNames(
        toggleGroupItemVariants({ variant, size }),
        'focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive/35',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  ),
);
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem, toggleGroupItemVariants };
