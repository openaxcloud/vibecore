import { Boxes, CalendarClock, Globe2, Server } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DEPLOYMENT_TYPES, type DeploymentType, type DeploymentTypeId } from './deployment-types';
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
  return (
    <fieldset className="grid gap-2 border-0 p-0">
      <legend className="text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
        Deployment type
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {DEPLOYMENT_TYPES.map((type) => (
          <TypeCard key={type.id} type={type} selected={type.id === selected} onSelect={() => onSelect(type.id)} />
        ))}
      </div>
    </fieldset>
  );
}

function TypeCard({ type, selected, onSelect }: { type: DeploymentType; selected: boolean; onSelect: () => void }) {
  const Icon = TYPE_ICONS[type.id];
  const comingSoon = type.status === 'coming-soon';

  return (
    <button
      type="button"
      onClick={comingSoon ? undefined : onSelect}
      aria-pressed={selected}
      aria-disabled={comingSoon}
      disabled={comingSoon}
      title={comingSoon ? 'Coming soon — requires managed compute infrastructure' : type.tagline}
      data-testid={`deployment-type-${type.id}`}
      className={classNames(
        'group flex h-full flex-col gap-1 rounded-md border p-3 text-left transition-colors',
        comingSoon
          ? 'cursor-not-allowed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 opacity-60'
          : selected
            ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-3'
            : 'cursor-pointer border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3',
      )}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={classNames(
            'h-4 w-4',
            selected ? 'text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textSecondary',
          )}
          aria-hidden
        />
        <span className="text-sm font-medium text-bolt-elements-textPrimary">{type.name}</span>
        {comingSoon ? (
          <span className="ml-auto rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
            Soon
          </span>
        ) : null}
      </span>
      <span className="text-xs text-bolt-elements-textSecondary">{type.tagline}</span>
      <span className="mt-1 text-[11px] text-bolt-elements-textTertiary">{type.bestFor}</span>
    </button>
  );
}
