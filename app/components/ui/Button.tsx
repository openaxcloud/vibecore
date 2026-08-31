import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { classNames } from '~/utils/classNames';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',

        /*
         * The blue action-accent CTA (H1): one factored primary so the six hand-rolled
         * copies stop drifting — and hover darkens the fill instead of turning the label
         * accent-coloured (invisible on the accent bg).
         *
         * Décision UNIF lot 5 : on GARDE l'alias `--vc-action-primary` ici (ne pas
         * hardcoder `--vc-ide-accent-action`). L'alias est surface-aware dans
         * index.scss : IDE → var(--vc-ide-accent-action) (le primary canonique plein
         * accent + texte blanc), user area → orange, auth/public/marketing → leurs
         * accents. Hardcoder l'accent IDE casserait ces surfaces.
         */
        primary:
          'bg-[var(--vc-action-primary)] text-[var(--vc-action-primary-foreground)] hover:bg-[var(--vc-action-primary-hover)]',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline:
          'border border-bolt-elements-borderColor bg-transparent hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary text-bolt-elements-textPrimary dark:border-bolt-elements-borderColorActive',
        secondary:
          'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
        ghost: 'hover:bg-bolt-elements-background-depth-1 hover:text-bolt-elements-textPrimary',
        link: 'text-bolt-elements-textPrimary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  _asChild?: boolean;
}

/**
 * Merge the Button's computed props onto an `_asChild` element so the rendered child
 * (e.g. an <a>) becomes the single semantic element carrying the button styling.
 * className is concatenated; refs are not merged here (forwarded ref takes precedence).
 */
export function mergeAsChildProps(
  childProps: Record<string, unknown>,
  buttonProps: { className?: string; [key: string]: unknown },
): Record<string, unknown> {
  const { className: childClassName, ...restChild } = childProps as { className?: string };
  const { className: buttonClassName, ...restButton } = buttonProps;

  return {
    ...restChild,
    ...restButton,
    className: classNames(buttonClassName, childClassName),
  };
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, _asChild = false, children, ...props }, ref) => {
    const effectiveVariant = variant ?? 'default';
    const effectiveSize = size ?? 'default';

    const buttonClassName = classNames(buttonVariants({ variant: effectiveVariant, size: effectiveSize }), className);

    /*
     * When `_asChild` is set, render the single child element (e.g. an <a>) with the
     * button styling instead of wrapping it in a <button>. This avoids invalid nested
     * interactive elements (<button><a/></button>) and produces correct semantics.
     */
    if (_asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;

      return React.cloneElement(child, {
        ...mergeAsChildProps(child.props, {
          ...props,
          className: buttonClassName,
          'data-vc-button': 'true',
          'data-variant': effectiveVariant,
          'data-size': effectiveSize,
        }),
        ref,
      } as Record<string, unknown>);
    }

    return (
      <button
        className={buttonClassName}
        data-vc-button="true"
        data-variant={effectiveVariant}
        data-size={effectiveSize}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
