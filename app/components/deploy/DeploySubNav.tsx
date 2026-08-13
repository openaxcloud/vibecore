import { classNames } from '~/utils/classNames';

/**
 * Replit-style Deploy/Publish sub-navigation: Overview · Logs · Domains · Manage.
 * Measured from Replit: 38px tall row, 14px tab labels. The active tab uses the
 * blue action accent (`--vc-ide-accent-action`) as a 2px underline — NOT orange;
 * orange is reserved for provider-branded surfaces. Surfaces stay dark for IDE
 * consistency.
 */
export type DeployView = 'overview' | 'logs' | 'domains' | 'manage';

export const DEPLOY_VIEWS: readonly { id: DeployView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'logs', label: 'Logs' },
  { id: 'domains', label: 'Domains' },
  { id: 'manage', label: 'Manage' },
];

export function DeploySubNav({ active, onSelect }: { active: DeployView; onSelect: (view: DeployView) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Deployment views"
      className="flex items-stretch gap-1 border-b border-bolt-elements-borderColor"
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
              'inline-flex h-[38px] items-center border-b-2 px-3 text-[14px] transition-colors',
              selected
                ? 'border-[var(--vc-ide-accent-action)] text-bolt-elements-textPrimary'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
