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
    titleClass: 'text-[15px] font-semibold',
    descriptionClass: 'text-[13px] mt-2',
    actions: 'mt-5',
    buttonClass: 'min-h-11 min-w-11 px-4 py-2 text-sm',
  },
  compact: {
    container: 'p-4 py-4',
    icon: {
      container: 'mb-2 h-10 w-10',
      size: 'h-5 w-5',
    },
    titleClass: 'text-[15px] font-semibold',
    descriptionClass: 'text-[13px] mt-1',
    actions: 'mt-3',
    buttonClass: 'min-h-11 min-w-11 px-3 py-2 text-xs',
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

/*
 * UNIF lot 4 — source UNIQUE du style « bouton primary » de l'IDE (décision
 * B2/K1 de docs/UX_UNIFORMIZATION_AUDIT.md) : CTA plein `--vc-ide-accent-action`
 * + texte blanc. `PanelButton` (project-ide/PanelPrimitives) importe cette
 * constante ; l'ancien style teinté `bg-bolt-elements-button-primary-*` n'est
 * plus qu'un alias legacy hors panneaux IDE.
 */
export const IDE_PRIMARY_ACCENT_CLASSES =
  'vc-cta-accent-fill bg-[var(--vc-cta-accent,var(--vc-ide-accent-action))] text-[var(--vc-ide-text-on-accent)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] focus-visible:ring-offset-1';

const PRIMARY_CTA_CLASSES = classNames(
  'inline-flex items-center justify-center rounded-md font-medium',
  IDE_PRIMARY_ACCENT_CLASSES,
);

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
        <Link to={to} className={classNames(PRIMARY_CTA_CLASSES, styles.buttonClass, 'whitespace-normal text-center')}>
          {actionLabel}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onAction}
          className={classNames(PRIMARY_CTA_CLASSES, styles.buttonClass, 'whitespace-normal text-center')}
        >
          {actionLabel}
        </button>
      )
    ) : null;

  const secondary =
    secondaryActionLabel && (secondaryTo || onSecondaryAction) ? (
      secondaryTo ? (
        <Link
          to={secondaryTo}
          className={classNames(SECONDARY_CTA_CLASSES, styles.buttonClass, 'whitespace-normal text-center')}
        >
          {secondaryActionLabel}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onSecondaryAction}
          className={classNames(SECONDARY_CTA_CLASSES, styles.buttonClass, 'whitespace-normal text-center')}
        >
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
      <h2 className={classNames('break-words text-bolt-elements-textPrimary', styles.titleClass)}>{title}</h2>
      {description ? (
        <p
          className={classNames(
            'mx-auto max-w-xl break-words text-bolt-elements-textSecondary',
            styles.descriptionClass,
          )}
        >
          {description}
        </p>
      ) : null}
      {primary || secondary ? (
        <div className={classNames('flex max-w-full flex-wrap items-center justify-center gap-2', styles.actions)}>
          {primary}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
