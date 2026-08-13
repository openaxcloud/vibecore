import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { classNames } from '~/utils/classNames';

/*
 * Variant-specific styles (canonical empty state: 40px icon tile on depth-3,
 * 15/600 title, 13px description, at most two CTAs).
 */
const VARIANT_STYLES = {
  default: {
    container: 'p-8',
    icon: {
      container: 'mb-3 h-10 w-10',
      size: 'h-5 w-5',
    },
    title: 'text-[15px] font-semibold',
    description: 'text-[13px] mt-2',
    actions: 'mt-5',
    button: 'h-9 px-4 text-sm',
  },
  compact: {
    container: 'p-4 py-4',
    icon: {
      container: 'mb-2 h-10 w-10',
      size: 'h-5 w-5',
    },
    title: 'text-[15px] font-semibold',
    description: 'text-[13px] mt-1',
    actions: 'mt-3',
    button: 'h-8 px-3 text-xs',
  },
};

interface EmptyStateProps {
  /** Icon: a UnoCSS icon class (e.g. 'i-ph:folder-simple-dashed') or a lucide component. */
  icon?: string | LucideIcon;

  /** Title text */
  title: string;

  /** Optional description text */
  description?: string;

  /** Primary action button label (blue action accent) */
  actionLabel?: string;

  /** Primary action button callback */
  onAction?: () => void;

  /** Primary action as an internal link (alternative to onAction) */
  to?: string;

  /** Secondary action button label (outline) */
  secondaryActionLabel?: string;

  /** Secondary action button callback */
  onSecondaryAction?: () => void;

  /** Secondary action as an internal link */
  secondaryTo?: string;

  /** Additional class name */
  className?: string;

  /** Component size variant */
  variant?: 'default' | 'compact';
}

const PRIMARY_CTA_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] focus-visible:ring-offset-1';

const SECONDARY_CTA_CLASSES =
  'inline-flex items-center justify-center rounded-md border border-bolt-elements-borderColor font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]';

/**
 * Canonical empty state, shared by the dashboard (formerly EmptyPanel in
 * SaaSLayout) and panel UIs. Primary CTA uses the app's blue action accent per
 * docs/DESIGN_ACCENTS.md; secondary CTA is an outline button.
 */
export function EmptyState({
  icon = 'i-ph:folder-simple-dashed',
  title,
  description,
  actionLabel,
  onAction,
  to,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryTo,
  className,
  variant = 'default',
}: EmptyStateProps) {
  const styles = VARIANT_STYLES[variant];
  const IconComponent = typeof icon === 'string' ? null : icon;

  const primary =
    actionLabel && (to || onAction) ? (
      to ? (
        <Link to={to} className={classNames(PRIMARY_CTA_CLASSES, styles.button)}>
          {actionLabel}
        </Link>
      ) : (
        <button type="button" onClick={onAction} className={classNames(PRIMARY_CTA_CLASSES, styles.button)}>
          {actionLabel}
        </button>
      )
    ) : null;

  const secondary =
    secondaryActionLabel && (secondaryTo || onSecondaryAction) ? (
      secondaryTo ? (
        <Link to={secondaryTo} className={classNames(SECONDARY_CTA_CLASSES, styles.button)}>
          {secondaryActionLabel}
        </Link>
      ) : (
        <button type="button" onClick={onSecondaryAction} className={classNames(SECONDARY_CTA_CLASSES, styles.button)}>
          {secondaryActionLabel}
        </button>
      )
    ) : null;

  return (
    <div
      className={classNames(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-bolt-elements-borderColor',
        'bg-bolt-elements-background-depth-2 text-center text-bolt-elements-textSecondary shadow-sm',
        styles.container,
        className,
      )}
    >
      <span
        className={classNames(
          'flex items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3',
          styles.icon.container,
        )}
      >
        {IconComponent ? (
          <IconComponent className={classNames(styles.icon.size, 'text-bolt-elements-textSecondary')} aria-hidden />
        ) : (
          <span className={classNames(icon as string, styles.icon.size, 'text-bolt-elements-textTertiary')} />
        )}
      </span>
      <h2 className={classNames('text-bolt-elements-textPrimary', styles.title)}>{title}</h2>
      {description ? (
        <p className={classNames('mx-auto max-w-xl text-bolt-elements-textSecondary', styles.description)}>
          {description}
        </p>
      ) : null}
      {primary || secondary ? (
        <div className={classNames('flex items-center gap-2', styles.actions)}>
          {primary}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
