import { CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import type { ProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

export type DeploymentPlanProvider = 'static' | 'server';

export type DeploymentPlanEntitlements = {
  version: string;
  plan: 'starter' | 'core' | 'pro' | 'enterprise';
  provider: string;
  providerReady: boolean;
  unavailableReason: null | 'region-operator-required' | 'plan-edge-operator-required';
  publishRegionMode: 'single' | 'all' | 'custom';
  publishRegions: string[];
  defaultPublishRegion: string | null;
  badgeRemovable: boolean;
  badgeRequired: boolean;
};

type PlanControlsCopy = ProjectDeploymentsCopy['publish']['entitlements'];

export function isDeploymentPlanReadyForPublish(
  entitlements: DeploymentPlanEntitlements | null | undefined,
  provider: DeploymentPlanProvider,
): boolean {
  if (
    !entitlements ||
    entitlements.provider !== provider ||
    !entitlements.providerReady ||
    !entitlements.defaultPublishRegion
  ) {
    return false;
  }

  return entitlements.publishRegions.includes(entitlements.defaultPublishRegion);
}

function planLabel(copy: PlanControlsCopy, plan: DeploymentPlanEntitlements['plan']): string {
  return copy.plans[plan];
}

function providerLabel(copy: PlanControlsCopy, provider: DeploymentPlanProvider): string {
  return provider === 'server' ? copy.providers.server : copy.providers.static;
}

export function PlanDeploymentControls({
  copy,
  provider,
  entitlements,
  loading,
  error,
  retrying,
  onRetry,
}: {
  copy: PlanControlsCopy;
  provider: DeploymentPlanProvider;
  entitlements: DeploymentPlanEntitlements | null;
  loading: boolean;
  error: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (loading || (entitlements && entitlements.provider !== provider)) {
    return <AsyncPanelSkeleton compact rows={2} label={copy.loading} />;
  }

  if (error || !entitlements) {
    return (
      <AsyncPanelError
        compact
        title={copy.errorTitle}
        description={error ?? copy.errorDescription}
        retryLabel={copy.retry}
        retrying={retrying}
        onRetry={onRetry}
      />
    );
  }

  if (!isDeploymentPlanReadyForPublish(entitlements, provider)) {
    const description =
      entitlements.unavailableReason === 'plan-edge-operator-required'
        ? copy.providerEdgeRequired
        : entitlements.unavailableReason === 'region-operator-required'
          ? copy.regionOperatorRequired
          : copy.invalidPolicy;

    return (
      <AsyncPanelError
        compact
        tone="warning"
        title={copy.unavailableTitle}
        description={description}
        retryLabel={copy.retry}
        retrying={retrying}
        onRetry={onRetry}
      />
    );
  }

  const hasRegionChoice = entitlements.publishRegions.length > 1;

  return (
    <section
      data-testid="deployment-plan-controls"
      aria-labelledby="deployment-plan-controls-title"
      className="grid min-w-0 gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id="deployment-plan-controls-title" className="text-sm font-semibold text-bolt-elements-textPrimary">
            {copy.title}
          </h3>
          <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">{copy.description}</p>
        </div>
        <span className="inline-flex min-h-7 shrink-0 items-center self-start rounded-full border border-bolt-elements-borderColor px-2.5 text-[11px] font-medium text-bolt-elements-textSecondary">
          {planLabel(copy, entitlements.plan)} · {copy.version.replace('{version}', entitlements.version)}
        </span>
      </div>

      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-bolt-elements-textSecondary">
            <CheckCircle2 className="h-4 w-4 text-[var(--status-success-text)]" aria-hidden />
            {copy.provider}
          </dt>
          <dd className="mt-1 break-words text-sm font-semibold text-bolt-elements-textPrimary">
            {providerLabel(copy, provider)}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-bolt-elements-textSecondary">
            <MapPin className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
            {copy.region}
          </dt>
          <dd className="mt-1 break-all text-sm font-semibold text-bolt-elements-textPrimary">
            {entitlements.defaultPublishRegion}
          </dd>
        </div>
      </dl>

      {hasRegionChoice ? (
        <label className="grid min-w-0 gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
          {copy.regionLabel}
          <select
            name="publishRegion"
            defaultValue={entitlements.defaultPublishRegion ?? undefined}
            className="min-h-[44px] w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 text-sm normal-case tracking-normal text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
          >
            {entitlements.publishRegions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="break-words text-xs leading-5 text-bolt-elements-textSecondary">{copy.regionAutomatic}</p>
      )}

      {entitlements.badgeRemovable ? (
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 focus-within:ring-2 focus-within:ring-bolt-elements-focus">
          <input
            type="checkbox"
            name="removeBrandingBadge"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-bolt-elements-borderColor accent-bolt-elements-item-contentAccent"
          />
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium text-bolt-elements-textPrimary">
              {copy.removeBadge}
            </span>
            <span className="mt-1 block break-words text-xs leading-5 text-bolt-elements-textSecondary">
              {copy.removeBadgeDescription}
            </span>
          </span>
        </label>
      ) : (
        <div className="flex min-w-0 items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">{copy.badgeRequired}</p>
            <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">
              {copy.badgeRequiredDescription}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
