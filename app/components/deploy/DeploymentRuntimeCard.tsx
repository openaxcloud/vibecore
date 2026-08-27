import { Ban, Loader2, RefreshCw, ServerCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Form, useFetcher } from 'react-router';
import {
  RESERVED_VM_TIER_IDS,
  ReservedVmConfigurator,
  validateReservedVmTiers,
  type ReservedVmTier,
  type ReservedVmTierId,
} from './ReservedVmConfigurator';
import { ensureDeploymentIdempotencyKey } from './deployment-idempotency';
import { Button } from '~/components/ui/Button';
import {
  formatProjectUserAreaCurrency,
  interpolateProjectCopy,
  type ProjectDeploymentsCopy,
  type ProjectUserAreaLanguage,
} from '~/lib/i18n/catalogs/project-user-area';
import { classNames } from '~/utils/classNames';

type RuntimeKind = 'autoscale' | 'reserved-vm';

export type RuntimeRateCard = Readonly<{
  version: number;
  currency: string;
  planKey: string;
  compute: { unitCents: number; requestCents: number };
  defaultMachineSize: string;
  machineSizes: readonly {
    key: string;
    label: string;
    vcpu: number;
    ramGb: number;
    computeUnitsPerSecond: number;
    available: boolean;
    reason?: 'plan' | 'capacity';
  }[];
  reservedVm: {
    enabled: boolean;
    reasonCode?: string;
    paidPlanEligible: boolean;
    termsVersion: string;
    tiers: readonly ReservedVmTier[];
  };
}>;

export type RuntimeDeployment = Readonly<{
  id: string;
  provider: string;
  runtimeKind?: RuntimeKind;
  runtimeVersion?: number;
  machineSize?: string;
  reservedVmTier?: ReservedVmTierId;
}>;

function hourlyPrice(
  card: RuntimeRateCard,
  size: RuntimeRateCard['machineSizes'][number],
  language: ProjectUserAreaLanguage,
) {
  const cents = size.computeUnitsPerSecond * 3_600 * card.compute.unitCents;

  return formatProjectUserAreaCurrency(cents / 100, card.currency, language, cents >= 100 ? 2 : 3);
}

function isPlanDenial(card: RuntimeRateCard): boolean {
  return (
    card.reservedVm.paidPlanEligible !== true ||
    card.planKey.trim().toLowerCase() === 'free' ||
    (card.reservedVm.reasonCode?.toUpperCase().includes('PLAN') ?? false)
  );
}

export function DeploymentRuntimeCard({
  projectId,
  workspaceId,
  deployment,
  busy,
  copy,
  language,
}: {
  projectId: string;
  workspaceId: string;
  deployment: RuntimeDeployment;
  busy: boolean;
  copy: ProjectDeploymentsCopy;
  language: ProjectUserAreaLanguage;
}) {
  const rateCardFetcher = useFetcher<{ rateCard: RuntimeRateCard | null }>();
  const rateCardHref = `/projects/${projectId}/deployments?rateCard=1`;

  useEffect(() => {
    rateCardFetcher.load(rateCardHref);
  }, [rateCardHref]);

  return (
    <DeploymentRuntimeForm
      workspaceId={workspaceId}
      deployment={deployment}
      busy={busy}
      copy={copy}
      language={language}
      rateCard={rateCardFetcher.data?.rateCard ?? null}
      loading={rateCardFetcher.state !== 'idle' || rateCardFetcher.data === undefined}
      onRetry={() => rateCardFetcher.load(rateCardHref)}
    />
  );
}

export function DeploymentRuntimeForm({
  workspaceId,
  deployment,
  busy,
  copy,
  language,
  rateCard,
  loading,
  onRetry,
}: {
  workspaceId: string;
  deployment: RuntimeDeployment;
  busy: boolean;
  copy: ProjectDeploymentsCopy;
  language: ProjectUserAreaLanguage;
  rateCard: RuntimeRateCard | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const currentRuntimeKind = deployment.runtimeKind ?? 'autoscale';
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>(currentRuntimeKind);
  const [machineSize, setMachineSize] = useState(deployment.machineSize ?? '');

  const [reservedTierId, setReservedTierId] = useState<ReservedVmTierId>(
    deployment.reservedVmTier ?? RESERVED_VM_TIER_IDS[0],
  );

  const [confirmed, setConfirmed] = useState(false);
  const reservedVm = rateCard?.reservedVm;
  const validReservedTiers = reservedVm ? validateReservedVmTiers(reservedVm.tiers) : null;
  const availableReservedTiers = validReservedTiers?.filter((tier) => tier.available !== false) ?? [];
  const firstAvailableReservedTierId = availableReservedTiers[0]?.id;
  const termsVersion = reservedVm?.termsVersion.trim() ?? '';
  const pricingValid = Boolean(validReservedTiers && termsVersion.length > 0 && termsVersion.length <= 128);
  const paidPlanDenied = Boolean(rateCard && isPlanDenial(rateCard));

  const reservedVmEnabled =
    reservedVm?.enabled === true && !paidPlanDenied && pricingValid && availableReservedTiers.length > 0;

  const selectedReservedTierAvailable = availableReservedTiers.some((tier) => tier.id === reservedTierId);
  const expectedRuntimeVersion = deployment.runtimeVersion;
  const versionValid = Number.isInteger(expectedRuntimeVersion) && Number(expectedRuntimeVersion) >= 0;

  useEffect(() => {
    if (!rateCard) {
      return;
    }

    if (!machineSize || !rateCard.machineSizes.some((size) => size.key === machineSize && size.available)) {
      setMachineSize(rateCard.defaultMachineSize);
    }
  }, [machineSize, rateCard]);

  useEffect(() => {
    setRuntimeKind(currentRuntimeKind);
    setMachineSize(deployment.machineSize ?? '');
    setReservedTierId(deployment.reservedVmTier ?? RESERVED_VM_TIER_IDS[0]);
    setConfirmed(false);
  }, [currentRuntimeKind, deployment.machineSize, deployment.reservedVmTier, deployment.runtimeVersion]);

  useEffect(() => {
    setConfirmed(false);
  }, [runtimeKind, reservedTierId, termsVersion]);

  useEffect(() => {
    if (!selectedReservedTierAvailable && firstAvailableReservedTierId) {
      setReservedTierId(firstAvailableReservedTierId);
    }
  }, [firstAvailableReservedTierId, selectedReservedTierAvailable]);

  const unchanged =
    runtimeKind === currentRuntimeKind &&
    (runtimeKind === 'reserved-vm'
      ? reservedTierId === deployment.reservedVmTier
      : machineSize === deployment.machineSize);
  const configurationReady =
    !loading &&
    Boolean(rateCard) &&
    versionValid &&
    (runtimeKind === 'reserved-vm'
      ? reservedVmEnabled && selectedReservedTierAvailable && confirmed
      : Boolean(machineSize));

  const canSubmit = configurationReady && !unchanged && !busy;

  const reservedUnavailableMessage = !rateCard
    ? copy.publish.rateCardUnavailable
    : reservedVm?.enabled === true && !pricingValid
      ? copy.publish.reservedVm.pricingInvalid
      : paidPlanDenied
        ? copy.publish.reservedVm.paidPlanRequired
        : copy.publish.reservedVm.operatorUnavailable;

  return (
    <section
      className="grid min-w-0 gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-md sm:p-5"
      aria-labelledby="deployment-runtime-title"
      data-testid="deployment-runtime-card"
    >
      <div className="min-w-0">
        <h2
          id="deployment-runtime-title"
          className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary"
        >
          <ServerCog className="h-4 w-4 shrink-0 text-bolt-elements-item-contentAccent" aria-hidden />
          {copy.runtime.title}
        </h2>
        <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">
          {copy.runtime.description}
        </p>
        {versionValid ? (
          <p className="mt-2 text-[11px] text-bolt-elements-textTertiary">
            {interpolateProjectCopy(copy.runtime.current, {
              runtime: currentRuntimeKind === 'reserved-vm' ? copy.runtime.reservedVm : copy.runtime.autoscale,
              version: Number(expectedRuntimeVersion),
            })}
          </p>
        ) : null}
      </div>

      {!versionValid ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-xs leading-5 text-[var(--status-error-text)]"
        >
          {copy.runtime.versionUnavailable}
        </div>
      ) : null}

      <Form
        method="post"
        className="grid min-w-0 gap-4"
        onSubmit={(event) => ensureDeploymentIdempotencyKey(event.currentTarget)}
      >
        <input type="hidden" name="intent" value="runtime" />
        <input type="hidden" name="deploymentId" value={deployment.id} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="expectedRuntimeVersion" value={expectedRuntimeVersion ?? ''} />
        <input type="hidden" name="runtimeKind" value={runtimeKind} />
        <input type="hidden" name="idempotencyKey" defaultValue="" />

        <fieldset className="min-w-0 border-0 p-0" disabled={busy || !versionValid}>
          <legend className="mb-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
            {copy.runtime.modeLegend}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['autoscale', copy.runtime.autoscale],
                ['reserved-vm', copy.runtime.reservedVm],
              ] as const
            ).map(([value, label]) => {
              const disabled = value === 'reserved-vm' && !reservedVmEnabled;

              return (
                <label
                  key={value}
                  className={classNames(
                    'flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 text-sm focus-within:ring-2 focus-within:ring-bolt-elements-focus',
                    runtimeKind === value
                      ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                      : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    name="runtimeKindChoice"
                    value={value}
                    checked={runtimeKind === value}
                    onChange={() => setRuntimeKind(value)}
                    disabled={disabled}
                    className="h-4 w-4 shrink-0 accent-bolt-elements-focus"
                  />
                  <span className="min-w-0 break-words">{label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {!loading && rateCard && !reservedVmEnabled && runtimeKind !== 'reserved-vm' ? (
          <RuntimeRateCardError
            message={reservedUnavailableMessage}
            retryLabel={copy.publish.retryRateCard}
            upgradeLabel={paidPlanDenied ? copy.publish.reservedVm.upgrade : undefined}
            onRetry={onRetry}
          />
        ) : null}

        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="flex min-h-[92px] items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-xs text-bolt-elements-textSecondary"
          >
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            {copy.publish.rateCardLoading}
          </div>
        ) : !rateCard ? (
          <RuntimeRateCardError
            message={copy.publish.rateCardUnavailable}
            retryLabel={copy.publish.retryRateCard}
            onRetry={onRetry}
          />
        ) : runtimeKind === 'autoscale' ? (
          <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
            {copy.publish.machineSize}
            <select
              name="machineSize"
              value={machineSize}
              onChange={(event) => setMachineSize(event.currentTarget.value)}
              disabled={busy}
              className="min-h-11 w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm normal-case tracking-normal text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
            >
              {rateCard.machineSizes.map((size) => (
                <option key={size.key} value={size.key} disabled={!size.available}>
                  {size.label} —{' '}
                  {interpolateProjectCopy(copy.publish.hourlyActive, {
                    amount: hourlyPrice(rateCard, size, language),
                  })}
                  {size.available
                    ? ''
                    : ` ${size.reason === 'plan' ? copy.publish.upgradePlan : copy.publish.unavailable}`}
                </option>
              ))}
            </select>
          </label>
        ) : reservedVmEnabled && validReservedTiers ? (
          <ReservedVmConfigurator
            tiers={validReservedTiers}
            termsVersion={termsVersion}
            selectedTierId={reservedTierId}
            confirmed={confirmed}
            disabled={busy}
            copy={copy.publish.reservedVm}
            language={language}
            onSelectTier={setReservedTierId}
            onConfirm={setConfirmed}
          />
        ) : (
          <RuntimeRateCardError
            message={reservedUnavailableMessage}
            retryLabel={copy.publish.retryRateCard}
            upgradeLabel={paidPlanDenied ? copy.publish.reservedVm.upgrade : undefined}
            onRetry={onRetry}
          />
        )}

        <p className="text-[11px] leading-5 text-bolt-elements-textTertiary">{copy.runtime.recovery}</p>
        {unchanged ? (
          <p role="status" className="text-xs text-bolt-elements-textTertiary">
            {copy.runtime.unchanged}
          </p>
        ) : null}
        <Button type="submit" disabled={!canSubmit} aria-busy={busy} className="min-h-11 gap-2 sm:justify-self-start">
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {busy ? copy.runtime.saving : copy.runtime.save}
        </Button>
      </Form>
    </section>
  );
}

function RuntimeRateCardError({
  message,
  retryLabel,
  upgradeLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  upgradeLabel?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid gap-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-xs leading-5 text-[var(--status-error-text)]"
    >
      <span className="flex items-start gap-2">
        <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {upgradeLabel ? (
          <a
            href="/upgrade"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-current px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
          >
            {upgradeLabel}
          </a>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-current px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
