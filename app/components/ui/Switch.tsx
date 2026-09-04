import * as SwitchPrimitive from '@radix-ui/react-switch';
import { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface SwitchProps {
  className?: string;
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (event: boolean) => void;

  /** Accessible name for the toggle (use one of these so screen readers announce what it controls). */
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const Switch = memo(
  ({
    className,
    onCheckedChange,
    checked,
    disabled,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }: SwitchProps) => {
    return (
      <SwitchPrimitive.Root
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={classNames(
          'relative h-6 w-11 cursor-pointer rounded-full bg-bolt-elements-button-primary-background',
          'transition-colors duration-200 ease-in-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:bg-bolt-elements-item-contentAccent',
          className,
        )}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(e) => onCheckedChange?.(e)}
      >
        <SwitchPrimitive.Thumb
          className={classNames(
            'block h-5 w-5 rounded-full bg-white',
            'shadow-lg shadow-black/20',
            'transition-transform duration-200 ease-in-out',
            'translate-x-0.5',
            'data-[state=checked]:translate-x-[1.375rem]',
            'will-change-transform',
          )}
        />
      </SwitchPrimitive.Root>
    );
  },
);
