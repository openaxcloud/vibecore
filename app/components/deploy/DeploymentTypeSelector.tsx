import { Boxes, CalendarClock, Globe2, Server } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDeploymentTypes, type DeploymentType, type DeploymentTypeId } from './deployment-types';
import { getDeployRemainingCopy, resolveDeployRemainingLanguage } from '~/lib/i18n/catalogs/deploy-remaining';
import { classNames } from '~/utils/classNames';

const TYPE_ICONS: Record<DeploymentTypeId, LucideIcon> = {
  static: Globe2,
  autoscale: Boxes,
  'reserved-vm': Server,
  scheduled: CalendarClock,
};

/**
 * Replit-style deployment-type picker. Renders one card per tier; the available
 * tier (static) is selectable, coming-soon tiers are disabled with a clear badge
 * so the menu reads like Replit's Publish dialog without pretending to deploy
 * compute tiers the backend cannot fulfil yet.
 */
export function DeploymentTypeSelector({
  selected,
  onSelect,
}: {
  selected: DeploymentTypeId;
  onSelect: (id: DeploymentTypeId) => void;
}) {
  const { i18n } = useTranslation();
  const language = resolveDeployRemainingLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDeployRemainingCopy(language);
  const deploymentTypes = getDeploymentTypes(language);

  return (
    <fieldset className="grid min-w-0 gap-2 border-0 p-0">
      <legend className="max-w-full break-words text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
        {copy['deployRemaining.selector.legend']}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {deploymentTypes.map((type) => (
          <TypeCard
            key={type.id}
            type={type}
            selected={type.id === selected}
            onSelect={() => onSelect(type.id)}
            soonLabel={copy['deployRemaining.selector.soon']}
            unavailableTitle={copy['deployRemaining.selector.unavailableTitle']}
          />
        ))}
      </div>
    </fieldset>
  );
}

function TypeCard({
  type,
  selected,
  onSelect,
  soonLabel,
  unavailableTitle,
}: {
  type: DeploymentType;
  selected: boolean;
  onSelect: () => void;
  soonLabel: string;
  unavailableTitle: string;
}) {
  const Icon = TYPE_ICONS[type.id];
  const comingSoon = type.status === 'coming-soon';

  return (
    <button
      type="button"
      onClick={comingSoon ? undefined : onSelect}
      aria-pressed={selected}
      aria-disabled={comingSoon}
      disabled={comingSoon}
      title={comingSoon ? unavailableTitle : type.tagline}
      data-testid={`deployment-type-${type.id}`}
      className={classNames(
        'group flex min-h-11 min-w-0 h-full flex-col gap-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bolt-elements-background-depth-1',
        comingSoon
          ? 'cursor-not-allowed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 opacity-60'
          : selected
            ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-3'
            : 'cursor-pointer border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3',
      )}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <Icon
          className={classNames(
            'h-4 w-4 shrink-0',
            selected ? 'text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textSecondary',
          )}
          aria-hidden
        />
        <span className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">{type.name}</span>
        {comingSoon ? (
          <span className="ml-auto shrink-0 rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
            {soonLabel}
          </span>
        ) : null}
      </span>
      <span className="break-words text-xs text-bolt-elements-textSecondary">{type.tagline}</span>
      <span className="mt-1 break-words text-[11px] text-bolt-elements-textTertiary">{type.bestFor}</span>
    </button>
  );
}
