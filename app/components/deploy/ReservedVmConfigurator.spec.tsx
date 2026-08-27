/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatReservedVmMonthlyPrice,
  isValidReservedVmSelection,
  ReservedVmConfigurator,
  validateReservedVmTiers,
  type ReservedVmTier,
  type ReservedVmTierId,
} from './ReservedVmConfigurator';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

const exactTiers = [
  { id: 'shared-0.5', label: 'Shared 0.5', vcpu: 0.5, memoryGb: 2, monthlyPriceCents: 2_000 },
  { id: 'dedicated-1', label: 'Dedicated 1', vcpu: 1, memoryGb: 4, monthlyPriceCents: 4_000 },
  { id: 'dedicated-2', label: 'Dedicated 2', vcpu: 2, memoryGb: 8, monthlyPriceCents: 8_000 },
  { id: 'dedicated-4', label: 'Dedicated 4', vcpu: 4, memoryGb: 16, monthlyPriceCents: 16_000 },
] as const satisfies readonly ReservedVmTier[];

afterEach(cleanup);

describe('Reserved VM rate-card validation', () => {
  it('accepts only the four exact production tiers and preserves their canonical order', () => {
    const reversed = [...exactTiers].reverse();

    expect(validateReservedVmTiers(reversed)?.map((tier) => tier.id)).toEqual([
      'shared-0.5',
      'dedicated-1',
      'dedicated-2',
      'dedicated-4',
    ]);
    expect(isValidReservedVmSelection('shared-0.5', 2_000)).toBe(true);
    expect(isValidReservedVmSelection('dedicated-4', 16_000)).toBe(true);
    expect(formatReservedVmMonthlyPrice(8_000)).toBe('$80');
  });

  it('fails closed on missing, duplicate, repriced or resource-drifted tiers', () => {
    expect(validateReservedVmTiers(exactTiers.slice(0, 3))).toBeNull();
    expect(validateReservedVmTiers([...exactTiers.slice(0, 3), exactTiers[0]])).toBeNull();
    expect(
      validateReservedVmTiers(
        exactTiers.map((tier) => (tier.id === 'dedicated-2' ? { ...tier, monthlyPriceCents: 8_001 } : tier)),
      ),
    ).toBeNull();
    expect(
      validateReservedVmTiers(exactTiers.map((tier) => (tier.id === 'dedicated-4' ? { ...tier, memoryGb: 15 } : tier))),
    ).toBeNull();
    expect(isValidReservedVmSelection('shared-0.5', 4_000)).toBe(false);
    expect(isValidReservedVmSelection('unknown', 2_000)).toBe(false);
  });
});

function ControlledConfigurator({ language = 'en' }: { language?: 'en' | 'fr' }) {
  const [selectedTierId, setSelectedTierId] = useState<ReservedVmTierId>('shared-0.5');
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form>
      <ReservedVmConfigurator
        tiers={exactTiers}
        termsVersion="reserved-vm-2026-08"
        selectedTierId={selectedTierId}
        confirmed={confirmed}
        copy={getProjectDeploymentsCopy(language).publish.reservedVm}
        language={language}
        onSelectTier={(tierId) => {
          setSelectedTierId(tierId);
          setConfirmed(false);
        }}
        onConfirm={setConfirmed}
      />
    </form>
  );
}

describe('ReservedVmConfigurator', () => {
  it('renders the exact $20/$40/$80/$160 ladder and binds terms, tier and price to explicit consent', () => {
    render(<ControlledConfigurator />);

    expect(screen.getByText('$20/month')).toBeTruthy();
    expect(screen.getByText('$40/month')).toBeTruthy();
    expect(screen.getByText('$80/month')).toBeTruthy();
    expect(screen.getByText('$160/month')).toBeTruthy();
    expect(screen.getByText('0.5 vCPU · 2 GB RAM')).toBeTruthy();
    expect(screen.getByText('4 vCPU · 16 GB RAM')).toBeTruthy();

    const confirmation = screen.getByRole('checkbox', {
      name: /confirm this Reserved VM reservation at \$20\/month/i,
    }) as HTMLInputElement;

    const terms = document.querySelector<HTMLInputElement>('input[name="reservedVmTermsVersion"]');
    const price = document.querySelector<HTMLInputElement>('input[name="reservedVmMonthlyPriceCents"]');
    const grid = screen.getByTestId('reserved-vm-tier-grid');

    expect(confirmation.required).toBe(true);
    expect(confirmation.checked).toBe(false);
    expect(terms?.value).toBe('reserved-vm-2026-08');
    expect(price?.value).toBe('2000');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');

    fireEvent.click(confirmation);
    expect(confirmation.checked).toBe(true);

    fireEvent.click(screen.getByTestId('reserved-vm-tier-dedicated-4'));
    expect(price?.value).toBe('16000');
    expect(
      screen.getByRole('checkbox', { name: /confirm this Reserved VM reservation at \$160\/month/i }),
    ).toHaveProperty('checked', false);
  });

  it('renders the full French consent surface without changing technical IDs or cents', () => {
    render(<ControlledConfigurator language="fr" />);

    expect(screen.getByRole('heading', { name: 'VM réservée' })).toBeTruthy();
    expect(screen.getByText('0,5 vCPU · 2 Go de RAM')).toBeTruthy();
    expect(screen.getByText('$20/mois')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Je confirme cette réservation de VM à \$20\/mois/i })).toBeTruthy();
    expect(document.querySelector<HTMLInputElement>('input[name="reservedVmTier"]')?.value).toBe('shared-0.5');
    expect(document.querySelector<HTMLInputElement>('input[name="reservedVmMonthlyPriceCents"]')?.value).toBe('2000');
  });

  it('disables all reservation inputs while an existing publish operation is busy', () => {
    render(
      <form>
        <ReservedVmConfigurator
          tiers={exactTiers}
          termsVersion="reserved-vm-2026-08"
          selectedTierId="shared-0.5"
          confirmed={false}
          disabled
          copy={getProjectDeploymentsCopy('en').publish.reservedVm}
          language="en"
          onSelectTier={vi.fn()}
          onConfirm={vi.fn()}
        />
      </form>,
    );

    expect(screen.getAllByRole('radio').every((radio) => radio.matches(':disabled'))).toBe(true);
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
  });
});
