import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { classNames } from '~/utils/classNames';

const badgeVariants = cva(
  'inline-flex items-center gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-bolt-elements-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
        secondary:
          'border-transparent bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
        destructive: 'border-transparent bg-[var(--status-error-bg)] text-[var(--status-error-text)] hover:opacity-80',
        outline: 'text-bolt-elements-textPrimary',
        primary: 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
        success: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
        warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
        danger: 'bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
        info: 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]',
        subtle:
          'border border-bolt-elements-borderColor/30 bg-bolt-elements-background-depth-2/50 backdrop-blur-sm text-bolt-elements-textSecondary',
      },
      size: {
        default: 'rounded-full px-2.5 py-0.5 text-xs font-semibold',
        sm: 'rounded-full px-1.5 py-0.5 text-xs',
        md: 'rounded-md px-2 py-1 text-xs font-medium',
        lg: 'rounded-md px-2.5 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  icon?: string;
}

function Badge({ className, variant, size, icon, children, ...props }: BadgeProps) {
  return (
    <div className={classNames(badgeVariants({ variant, size }), className)} {...props}>
      {icon && <span className={icon} />}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
