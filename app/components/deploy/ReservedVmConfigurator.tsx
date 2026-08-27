import { CheckCircle2, Database, Server } from 'lucide-react';
import type { ProjectDeploymentsCopy, ProjectUserAreaLanguage } from '~/lib/i18n/catalogs/project-user-area';
import { interpolateProjectCopy } from '~/lib/i18n/catalogs/project-user-area';
import { classNames } from '~/utils/classNames';

export const RESERVED_VM_TIER_IDS = ['shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4'] as const;

export type ReservedVmTierId = (typeof RESERVED_VM_TIER_IDS)[number];

export type ReservedVmTier = Readonly<{
  id: ReservedVmTierId;

  /** Legacy cards may include a label; UI copy is always composed locally. */
  label?: string;
  vcpu: number;
  memoryGb: number;
  monthlyPriceCents: number;
  available?: boolean;
  reason?: 'plan' | 'capacity';
}>;

const EXPECTED_RESERVED_VM_TIERS: Readonly<
  Record<ReservedVmTierId, Readonly<{ vcpu: number; memoryGb: number; monthlyPriceCents: number }>>
> = {
  'shared-0.5': { vcpu: 0.5, memoryGb: 2, monthlyPriceCents: 2_000 },
  'dedicated-1': { vcpu: 1, memoryGb: 4, monthlyPriceCents: 4_000 },
  'dedicated-2': { vcpu: 2, memoryGb: 8, monthlyPriceCents: 8_000 },
  'dedicated-4': { vcpu: 4, memoryGb: 16, monthlyPriceCents: 16_000 },
};

/**
 * Billing confirmation is only rendered when the server card exactly matches
 * the supported Reserved VM ladder. This prevents a partial, duplicated, or
 * stale card from placing an ambiguously priced reservation.
 */
export function validateReservedVmTiers(tiers: readonly ReservedVmTier[]): readonly ReservedVmTier[] | null {
  if (tiers.length !== RESERVED_VM_TIER_IDS.length) {
    return null;
  }

  const byId = new Map(tiers.map((tier) => [tier.id, tier] as const));

  if (byId.size !== RESERVED_VM_TIER_IDS.length) {
    return null;
  }

  for (const id of RESERVED_VM_TIER_IDS) {
    const tier = byId.get(id);
    const expected = EXPECTED_RESERVED_VM_TIERS[id];

    if (
      !tier ||
      tier.vcpu !== expected.vcpu ||
      tier.memoryGb !== expected.memoryGb ||
      tier.monthlyPriceCents !== expected.monthlyPriceCents
    ) {
      return null;
    }
  }

  return RESERVED_VM_TIER_IDS.map((id) => byId.get(id) as ReservedVmTier);
}

export function isValidReservedVmSelection(tierId: string, monthlyPriceCents: number): tierId is ReservedVmTierId {
  return (
    RESERVED_VM_TIER_IDS.includes(tierId as ReservedVmTierId) &&
    EXPECTED_RESERVED_VM_TIERS[tierId as ReservedVmTierId].monthlyPriceCents === monthlyPriceCents
  );
}

/** USD is the fixed Reserved VM billing currency in the API contract. */
export function formatReservedVmMonthlyPrice(monthlyPriceCents: number): string {
  return `$${Math.floor(monthlyPriceCents / 100)}`;
}

type ReservedVmCopy = ProjectDeploymentsCopy['publish']['reservedVm'];

export function ReservedVmConfigurator({
  tiers,
  termsVersion,
  selectedTierId,
  confirmed,
  disabled = false,
  copy,
  language,
  onSelectTier,
  onConfirm,
}: {
  tiers: readonly ReservedVmTier[];
  termsVersion: string;
  selectedTierId: ReservedVmTierId;
  confirmed: boolean;
  disabled?: boolean;
  copy: ReservedVmCopy;
  language: ProjectUserAreaLanguage;
  onSelectTier: (tierId: ReservedVmTierId) => void;
  onConfirm: (confirmed: boolean) => void;
}) {
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId) ?? tiers[0];

  if (!selectedTier) {
    return null;
  }

  const selectedAmount = formatReservedVmMonthlyPrice(selectedTier.monthlyPriceCents);
  const confirmationDescriptionId = 'reserved-vm-confirmation-description';

  return (
    <section
      aria-labelledby="reserved-vm-config-title"
      className="grid min-w-0 gap-4 rounded-lg border border-bolt-elements-item-contentAccent/40 bg-bolt-elements-background-depth-1 p-4"
      data-testid="reserved-vm-configurator"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3
            id="reserved-vm-config-title"
            className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary"
          >
            <Server className="h-4 w-4 shrink-0 text-bolt-elements-item-contentAccent" aria-hidden />
            {copy.title}
          </h3>
          <p className="mt-1 break-words text-xs leading-5 text-bolt-elements-textSecondary">{copy.description}</p>
        </div>
        <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 self-start rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2.5 text-[11px] font-medium text-[var(--status-success-text)]">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {copy.available}
        </span>
      </div>

      <fieldset className="min-w-0 border-0 p-0" disabled={disabled}>
        <legend className="mb-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
          {copy.tierLegend}
        </legend>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2" data-testid="reserved-vm-tier-grid">
          {tiers.map((tier) => {
            const selected = tier.id === selectedTierId;
            const amount = formatReservedVmMonthlyPrice(tier.monthlyPriceCents);
            const tierDisabled = disabled || tier.available === false;
            const formattedCpu = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(tier.vcpu);

            const tierLabel =
              tier.id === 'shared-0.5'
                ? copy.sharedTier
                : interpolateProjectCopy(copy.dedicatedTier, { cpu: formattedCpu });

            return (
              <label
                key={tier.id}
                className={classNames(
                  'relative flex min-h-[92px] min-w-0 cursor-pointer flex-col justify-between gap-2 rounded-md border p-3 transition-colors focus-within:ring-2 focus-within:ring-bolt-elements-focus focus-within:ring-offset-2 focus-within:ring-offset-bolt-elements-background-depth-1',
                  selected
                    ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-background-depth-3'
                    : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
                  tierDisabled ? 'cursor-not-allowed opacity-60' : '',
                )}
              >
                <input
                  type="radio"
                  name="reservedVmTier"
                  value={tier.id}
                  checked={selected}
                  onChange={() => onSelectTier(tier.id)}
                  disabled={tierDisabled}
                  className="sr-only"
                  data-testid={`reserved-vm-tier-${tier.id}`}
                />
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">
                    {tierLabel}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-bolt-elements-item-contentAccent">
                    {interpolateProjectCopy(copy.monthly, { amount })}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-bolt-elements-textSecondary">
                  <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {interpolateProjectCopy(copy.cpuMemory, {
                    cpu: formattedCpu,
                    memory: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(tier.memoryGb),
                  })}
                </span>
                {tier.available === false ? (
                  <span className="text-[11px] font-medium text-[var(--status-warning-text)]">
                    {copy.tierUnavailable}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <input type="hidden" name="reservedVmTermsVersion" value={termsVersion} />
      <input type="hidden" name="reservedVmMonthlyPriceCents" value={selectedTier.monthlyPriceCents} />

      <div className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-5 text-bolt-elements-textPrimary">
          <input
            type="checkbox"
            name="reservedVmConfirmation"
            checked={confirmed}
            onChange={(event) => onConfirm(event.currentTarget.checked)}
            required
            disabled={disabled}
            aria-describedby={confirmationDescriptionId}
            className="mt-0.5 h-5 w-5 shrink-0 accent-bolt-elements-focus"
          />
          <span className="break-words">{interpolateProjectCopy(copy.confirmation, { amount: selectedAmount })}</span>
        </label>
        <p id={confirmationDescriptionId} className="pl-8 text-[11px] leading-5 text-bolt-elements-textTertiary">
          {copy.confirmationHint}
        </p>
      </div>
    </section>
  );
}
