import { forwardRef } from 'react';
import { classNames } from '~/utils/classNames';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Base classes for the Input primitive. Uses only theme tokens that actually
 * exist in uno.config.ts: `borderColor` / `borderColorActive` (not the
 * non-existent `border`/`ring` leaves) and the `background.depth.*` scale (not
 * the `background` object node, which emits no color rule). Exported for tests.
 */
export const inputBaseClassName =
  'flex h-10 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm ring-offset-bolt-elements-background-depth-1 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-bolt-elements-textSecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return <input type={type} className={classNames(inputBaseClassName, className)} ref={ref} {...props} />;
});

Input.displayName = 'Input';

export { Input };
