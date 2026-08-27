/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComputeRateCardError,
  ComputeRateCardSkeleton,
  reservedVmUnavailableReason,
  type DeployRateCard,
} from './projects.$projectId.deployments';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

const validCard: DeployRateCard = {
  version: 7,
  currency: 'usd',
  compute: { unitCents: 0.00032, requestCents: 0.00012 },
  planKey: 'pro',
  defaultMachineSize: 'shared-0.5',
  machineSizes: [
    {
      key: 'shared-0.5',
      label: '0.5 vCPU · 2 GiB',
      vcpu: 0.5,
      ramGb: 2,
      computeUnitsPerSecond: 13,
      available: true,
    },
  ],
  reservedVm: {
    enabled: true,
    paidPlanEligible: true,
    termsVersion: 'reserved-vm-2026-08',
    tiers: [
      { id: 'shared-0.5', label: 'Shared 0.5', vcpu: 0.5, memoryGb: 2, monthlyPriceCents: 2_000 },
      { id: 'dedicated-1', label: 'Dedicated 1', vcpu: 1, memoryGb: 4, monthlyPriceCents: 4_000 },
      { id: 'dedicated-2', label: 'Dedicated 2', vcpu: 2, memoryGb: 8, monthlyPriceCents: 8_000 },
      { id: 'dedicated-4', label: 'Dedicated 4', vcpu: 4, memoryGb: 16, monthlyPriceCents: 16_000 },
    ],
  },
};

afterEach(cleanup);

describe('Reserved VM capability messages', () => {
  const copy = getProjectDeploymentsCopy('en');

  it('stays fail closed through loading, fetch failure, plan denial, operator denial and pricing drift', () => {
    expect(reservedVmUnavailableReason({ loading: true, rateCard: null, pricingValid: false, copy })).toEqual({
      message: copy.publish.rateCardLoading,
      paidPlan: false,
    });
    expect(reservedVmUnavailableReason({ loading: false, rateCard: null, pricingValid: false, copy })).toEqual({
      message: copy.publish.rateCardUnavailable,
      paidPlan: false,
    });
    expect(
      reservedVmUnavailableReason({
        loading: false,
        rateCard: {
          ...validCard,
          planKey: 'free',
          reservedVm: {
            ...validCard.reservedVm,
            enabled: false,
            paidPlanEligible: false,
            reasonCode: 'PAID_PLAN_REQUIRED',
          },
        },
        pricingValid: true,
        copy,
      }),
    ).toEqual({ message: copy.publish.reservedVm.paidPlanRequired, paidPlan: true });
    expect(
      reservedVmUnavailableReason({
        loading: false,
        rateCard: {
          ...validCard,
          reservedVm: { ...validCard.reservedVm, enabled: true, paidPlanEligible: false },
        },
        pricingValid: true,
        copy,
      }),
    ).toEqual({ message: copy.publish.reservedVm.paidPlanRequired, paidPlan: true });
    expect(
      reservedVmUnavailableReason({
        loading: false,
        rateCard: {
          ...validCard,
          reservedVm: { ...validCard.reservedVm, enabled: false, reasonCode: 'OPERATOR_DISABLED' },
        },
        pricingValid: true,
        copy,
      }),
    ).toEqual({ message: copy.publish.reservedVm.operatorUnavailable, paidPlan: false });
    expect(reservedVmUnavailableReason({ loading: false, rateCard: validCard, pricingValid: false, copy })).toEqual({
      message: copy.publish.reservedVm.pricingInvalid,
      paidPlan: false,
    });
    expect(reservedVmUnavailableReason({ loading: false, rateCard: validCard, pricingValid: true, copy })).toEqual({
      message: '',
      paidPlan: false,
    });
  });
});

describe('compute rate-card recovery states', () => {
  it('renders an explicit responsive skeleton with reduced-motion support', () => {
    render(<ComputeRateCardSkeleton label="Loading current compute pricing and availability…" />);

    const status = screen.getByRole('status');

    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading current compute pricing and availability…')).toBeTruthy();
    expect(status.querySelector('.grid-cols-1')).toBeTruthy();
    expect(status.querySelector('.sm\\:grid-cols-2')).toBeTruthy();
    expect(status.innerHTML).toContain('motion-reduce:animate-none');
  });

  it('exposes 44px retry and upgrade recovery actions', () => {
    const onRetry = vi.fn();

    render(
      <ComputeRateCardError
        message="Reserved VM requires an active paid plan."
        retryLabel="Retry pricing"
        upgradeLabel="View paid plans"
        onRetry={onRetry}
      />,
    );

    const retry = screen.getByRole('button', { name: 'Retry pricing' });
    const upgrade = screen.getByRole('link', { name: 'View paid plans' });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(retry.className).toContain('min-h-11');
    expect(upgrade.className).toContain('min-h-11');
    expect(upgrade.getAttribute('href')).toBe('/upgrade');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
