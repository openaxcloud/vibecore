/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DeploymentRuntimeForm, type RuntimeDeployment, type RuntimeRateCard } from './DeploymentRuntimeCard';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

const exactRateCard = {
  version: 7,
  currency: 'usd',
  planKey: 'pro',
  compute: { unitCents: 0.00032, requestCents: 0.00012 },
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
    {
      key: 'dedicated-1',
      label: '1 vCPU · 4 GiB',
      vcpu: 1,
      ramGb: 4,
      computeUnitsPerSecond: 26,
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
} as const;

function renderInRouter(node: ReactNode) {
  const router = createMemoryRouter(
    [
      {
        id: 'runtime-settings',
        path: '/projects/:projectId/deployments',
        element: node,
      },
    ],
    { initialEntries: ['/projects/project_1/deployments'] },
  );

  return { router, ...render(<RouterProvider router={router} />) };
}

const autoscaleDeployment: RuntimeDeployment = {
  id: 'deployment_1',
  provider: 'server',
  runtimeKind: 'autoscale',
  runtimeVersion: 3,
  machineSize: 'shared-0.5',
};

function renderRuntimeForm({
  rateCard = exactRateCard,
  language = 'en',
  deployment = autoscaleDeployment,
  loading = false,
  onRetry = () => undefined,
}: {
  rateCard?: RuntimeRateCard | null;
  language?: 'en' | 'fr';
  deployment?: RuntimeDeployment;
  loading?: boolean;
  onRetry?: () => void;
} = {}) {
  return renderInRouter(
    <DeploymentRuntimeForm
      workspaceId="workspace_1"
      deployment={deployment}
      busy={false}
      copy={getProjectDeploymentsCopy(language)}
      language={language}
      rateCard={rateCard}
      loading={loading}
      onRetry={onRetry}
    />,
  );
}

afterEach(cleanup);

describe('DeploymentRuntimeCard', () => {
  it('surfaces an in-place Reserved VM change with CAS context and exact reconfirmation', async () => {
    renderRuntimeForm();

    expect(screen.getByText('Current: Autoscale · configuration v3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply runtime change' })).toHaveProperty('disabled', true);

    const reservedMode = await screen.findByRole('radio', { name: 'Reserved VM' });

    await waitFor(() => expect(reservedMode).toHaveProperty('disabled', false));
    fireEvent.click(reservedMode);

    const tier = await screen.findByTestId('reserved-vm-tier-dedicated-4');

    fireEvent.click(tier);

    const confirmation = screen.getByRole('checkbox', {
      name: /confirm this Reserved VM reservation at \$160\/month/i,
    });

    expect(screen.getByRole('button', { name: 'Apply runtime change' })).toHaveProperty('disabled', true);
    fireEvent.click(confirmation);
    expect(screen.getByRole('button', { name: 'Apply runtime change' })).toHaveProperty('disabled', false);
    expect(document.querySelector<HTMLInputElement>('input[name="expectedRuntimeVersion"]')?.value).toBe('3');
    expect(document.querySelector<HTMLInputElement>('input[name="runtimeKind"]')?.value).toBe('reserved-vm');
    expect(document.querySelector<HTMLInputElement>('input[name="reservedVmMonthlyPriceCents"]')?.value).toBe('16000');
  });

  it('accepts runtimeVersion zero as the valid initial CAS fence', async () => {
    renderRuntimeForm({ deployment: { ...autoscaleDeployment, runtimeVersion: 0 } });

    expect(screen.getByText('Current: Autoscale · configuration v0')).toBeTruthy();

    const reservedMode = await screen.findByRole('radio', { name: 'Reserved VM' });
    expect(reservedMode).toHaveProperty('disabled', false);
    fireEvent.click(reservedMode);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /confirm this Reserved VM reservation at \$20\/month/i,
      }),
    );
    expect(screen.getByRole('button', { name: 'Apply runtime change' })).toHaveProperty('disabled', false);
    expect(document.querySelector<HTMLInputElement>('input[name="expectedRuntimeVersion"]')?.value).toBe('0');
  });

  it('fails closed for a free plan and recovers after a successful pricing retry', async () => {
    const deniedCard = {
      ...exactRateCard,
      planKey: 'free',
      reservedVm: {
        ...exactRateCard.reservedVm,
        enabled: false,
        paidPlanEligible: false,
        reasonCode: 'PAID_PLAN_REQUIRED',
      },
    };

    function RecoveryHarness() {
      const [recovered, setRecovered] = useState(false);

      return (
        <DeploymentRuntimeForm
          workspaceId="workspace_1"
          deployment={autoscaleDeployment}
          busy={false}
          copy={getProjectDeploymentsCopy('en')}
          language="en"
          rateCard={recovered ? exactRateCard : deniedCard}
          loading={false}
          onRetry={() => setRecovered(true)}
        />
      );
    }

    renderInRouter(<RecoveryHarness />);

    const reservedMode = await screen.findByRole('radio', { name: 'Reserved VM' });

    await waitFor(() => expect(reservedMode).toHaveProperty('disabled', true));
    expect(screen.getByText('Reserved VM requires an active paid plan.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View paid plans' }).getAttribute('href')).toBe('/upgrade');

    fireEvent.click(screen.getByRole('button', { name: 'Retry pricing' }));
    await waitFor(() => expect(reservedMode).toHaveProperty('disabled', false));
    expect(screen.queryByText('Reserved VM requires an active paid plan.')).toBeNull();
  });

  it('fails closed when operator capacity exists but the paid-plan entitlement does not', async () => {
    renderRuntimeForm({
      rateCard: {
        ...exactRateCard,
        reservedVm: { ...exactRateCard.reservedVm, paidPlanEligible: false },
      },
    });

    const reservedMode = await screen.findByRole('radio', { name: 'Reserved VM' });

    await waitFor(() => expect(reservedMode).toHaveProperty('disabled', true));
    expect(screen.getByText('Reserved VM requires an active paid plan.')).toBeTruthy();
  });

  it('localizes the recovery contract and keeps the card responsive at mobile, tablet and desktop widths', async () => {
    renderRuntimeForm({ language: 'fr' });

    await screen.findByText('Actuel : Mise à l’échelle automatique · configuration v3');

    const card = screen.getByTestId('deployment-runtime-card');

    expect(card.className).toContain('min-w-0');
    expect(card.className).toContain('p-4');
    expect(card.className).toContain('sm:p-5');
    expect(screen.getByText(/Si le provisionnement échoue/)).toBeTruthy();

    for (const width of [390, 768, 1_440]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      window.dispatchEvent(new Event('resize'));
      expect(screen.getByTestId('deployment-runtime-card')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Appliquer la modification' }).className).toContain('min-h-11');
    }
  });

  it('blocks mutation when the CAS version is absent', async () => {
    renderRuntimeForm({
      deployment: { id: 'deployment_1', provider: 'server', runtimeKind: 'autoscale' },
    });

    expect(screen.getByRole('alert').textContent).toMatch(/configuration version is unavailable/i);
    expect(screen.getByRole('button', { name: 'Apply runtime change' })).toHaveProperty('disabled', true);
  });
});
