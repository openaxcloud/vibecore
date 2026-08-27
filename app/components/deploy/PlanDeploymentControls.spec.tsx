/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} aria-busy="true" />,
  AsyncPanelError: ({
    title,
    description,
    retryLabel,
    onRetry,
  }: {
    title: string;
    description: string;
    retryLabel: string;
    onRetry: () => void;
  }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </section>
  ),
}));

import {
  isDeploymentPlanReadyForPublish,
  PlanDeploymentControls,
  type DeploymentPlanEntitlements,
} from './PlanDeploymentControls';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

const copy = getProjectDeploymentsCopy('en').publish.entitlements;

const starterStatic: DeploymentPlanEntitlements = {
  version: '2026-08-27.1',
  plan: 'starter',
  provider: 'static',
  providerReady: true,
  unavailableReason: null,
  publishRegionMode: 'single',
  publishRegions: ['global'],
  defaultPublishRegion: 'global',
  badgeRemovable: false,
  badgeRequired: true,
};

afterEach(cleanup);

describe('PlanDeploymentControls', () => {
  it('fails closed while the server policy is missing, stale, or incomplete', () => {
    expect(isDeploymentPlanReadyForPublish(null, 'static')).toBe(false);
    expect(isDeploymentPlanReadyForPublish({ ...starterStatic, provider: 'server' }, 'static')).toBe(false);
    expect(isDeploymentPlanReadyForPublish({ ...starterStatic, providerReady: false }, 'static')).toBe(false);
    expect(isDeploymentPlanReadyForPublish({ ...starterStatic, defaultPublishRegion: null }, 'static')).toBe(false);
    expect(
      isDeploymentPlanReadyForPublish({ ...starterStatic, defaultPublishRegion: 'missing-region' }, 'static'),
    ).toBe(false);
    expect(isDeploymentPlanReadyForPublish(starterStatic, 'static')).toBe(true);
  });

  it('renders an explicit loading state for an unverified or stale provider policy', () => {
    const { rerender } = render(
      <PlanDeploymentControls
        copy={copy}
        provider="static"
        entitlements={null}
        loading
        error={null}
        retrying={false}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Verifying publication permissions')).toBeTruthy();

    rerender(
      <PlanDeploymentControls
        copy={copy}
        provider="static"
        entitlements={{ ...starterStatic, provider: 'server' }}
        loading={false}
        error={null}
        retrying={false}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Verifying publication permissions')).toBeTruthy();
  });

  it('surfaces recoverable provider enforcement failures without rendering forbidden fields', () => {
    const retry = vi.fn();

    render(
      <PlanDeploymentControls
        copy={copy}
        provider="server"
        entitlements={{
          ...starterStatic,
          provider: 'server',
          providerReady: false,
          unavailableReason: 'plan-edge-operator-required',
          publishRegions: [],
          defaultPublishRegion: null,
        }}
        loading={false}
        error={null}
        retrying={false}
        onRetry={retry}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('cannot enforce');
    expect(document.querySelector('[name="publishRegion"]')).toBeNull();
    expect(document.querySelector('[name="removeBrandingBadge"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry permission check' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('does not expose non-actionable fields for Starter single-region publishing', () => {
    render(
      <PlanDeploymentControls
        copy={copy}
        provider="static"
        entitlements={starterStatic}
        loading={false}
        error={null}
        retrying={false}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByText('Static edge')).toBeTruthy();
    expect(screen.getByText('global')).toBeTruthy();
    expect(screen.getByText('E-Code badge required')).toBeTruthy();
    expect(document.querySelector('[name="publishRegion"]')).toBeNull();
    expect(document.querySelector('[name="removeBrandingBadge"]')).toBeNull();
  });

  it('renders only the exact actionable region and badge form fields with responsive touch-safe controls', () => {
    const { container } = render(
      <PlanDeploymentControls
        copy={copy}
        provider="server"
        entitlements={{
          ...starterStatic,
          plan: 'pro',
          provider: 'server',
          publishRegionMode: 'all',
          publishRegions: ['eu-west-1', 'us-east-1'],
          defaultPublishRegion: 'eu-west-1',
          badgeRemovable: true,
          badgeRequired: false,
        }}
        loading={false}
        error={null}
        retrying={false}
        onRetry={() => undefined}
      />,
    );

    const region = screen.getByLabelText('Publication region');
    const badge = screen.getByRole('checkbox', { name: /Remove the E-Code badge/u });
    const panel = screen.getByTestId('deployment-plan-controls');

    expect(region.getAttribute('name')).toBe('publishRegion');
    expect(region.className).toContain('min-h-[44px]');
    expect((region as HTMLSelectElement).value).toBe('eu-west-1');
    expect(badge.getAttribute('name')).toBe('removeBrandingBadge');
    expect(badge.closest('label')?.className).toContain('min-h-[44px]');
    expect(panel.querySelector('dl')?.className).toContain('sm:grid-cols-2');
    expect(container.querySelectorAll('select[name="publishRegion"]')).toHaveLength(1);
    expect(container.querySelectorAll('input[name="removeBrandingBadge"]')).toHaveLength(1);
  });
});
