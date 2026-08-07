import { projectUserAreaEn } from '~/lib/i18n/catalogs/project-user-area';
import { classNames } from '~/utils/classNames';

/**
 * Replit-style Deploy/Publish sub-navigation: Overview · Logs · Domains · Manage.
 * Measured from Replit: 38px tall row, 14px tab labels. The active tab uses the
 * blue action accent (`--vc-ide-accent-action`) as a 2px underline — NOT orange;
 * orange is reserved for provider-branded surfaces. Surfaces stay dark for IDE
 * consistency.
 */
export type DeployView = 'overview' | 'logs' | 'domains' | 'manage';

const defaultNavigation = projectUserAreaEn.projectUserArea.deployments.navigation;

export const DEPLOY_VIEWS: readonly { id: DeployView; label: string }[] = [
  { id: 'overview', label: defaultNavigation.overview },
  { id: 'logs', label: defaultNavigation.logs },
  { id: 'domains', label: defaultNavigation.domains },
  { id: 'manage', label: defaultNavigation.manage },
];

export type DeployViewLabels = Readonly<Record<DeployView, string>>;

export function DeploySubNav({
  active,
  onSelect,
  labels,
  ariaLabel = defaultNavigation.aria,
}: {
  active: DeployView;
  onSelect: (view: DeployView) => void;
  labels?: Partial<DeployViewLabels>;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex min-w-0 items-stretch gap-1 overflow-x-auto border-b border-bolt-elements-borderColor"
    >
      {DEPLOY_VIEWS.map((view) => {
        const selected = view.id === active;

        return (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`deploy-view-${view.id}`}
            onClick={() => onSelect(view.id)}
            className={classNames(
              'inline-flex h-[38px] shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-[14px] transition-colors',
              selected
                ? 'border-[var(--vc-ide-accent-action)] text-bolt-elements-textPrimary'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            {labels?.[view.id] ?? view.label}
          </button>
        );
      })}
    </div>
  );
}
