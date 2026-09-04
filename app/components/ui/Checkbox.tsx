import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import * as React from 'react';
import { classNames } from '~/utils/classNames';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={classNames(
      'peer h-4 w-4 shrink-0 rounded-sm border transition-colors',
      'bg-transparent',
      'border-bolt-elements-borderColor',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-bolt-elements-item-contentAccent',
      'data-[state=checked]:border-bolt-elements-item-contentAccent',
      'data-[state=checked]:text-white',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3 w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
