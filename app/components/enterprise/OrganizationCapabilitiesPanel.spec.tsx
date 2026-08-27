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
  mergeSecurityCenterEvents,
  OrganizationCapabilitiesPanel,
  type EnterpriseCapabilities,
  type SecurityCenterEvent,
} from './OrganizationCapabilitiesPanel';
import { getOrganizationSecurityCopy } from '~/lib/i18n/catalogs/organization-security';

const enterpriseCapabilities: EnterpriseCapabilities = {
  version: '2026-08-27.1',
  plan: 'enterprise',
  capabilities: [
    {
      key: 'single-tenant',
      entitled: true,
      provisioned: false,
      state: 'operator-required',
      surface: null,
    },
    {
      key: 'static-outbound-ip',
      entitled: true,
      provisioned: false,
      state: 'operator-required',
      surface: null,
    },
    { key: 'vpc-peering', entitled: true, provisioned: false, state: 'operator-required', surface: null },
    { key: 'data-warehouse', entitled: true, provisioned: false, state: 'operator-required', surface: null },
    {
      key: 'security-center',
      entitled: true,
      provisioned: true,
      state: 'ready',
      surface: 'security-center-events',
    },
  ],
};

function props(overrides: Partial<Parameters<typeof OrganizationCapabilitiesPanel>[0]> = {}) {
  return {
    copy: getOrganizationSecurityCopy('en'),
    language: 'en',
    capabilities: enterpriseCapabilities,
    capabilitiesErrorKind: null,
    securityEvents: [],
    securityOpenCount: 0,
    securityErrorKind: null,
    securityNextCursor: null,
    securityLoadingMore: false,
    securityLoadMoreErrorKind: null,
    loading: false,
    retrying: false,
    onRetry: vi.fn(),
    onLoadMore: vi.fn(),
    onRetryLoadMore: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof OrganizationCapabilitiesPanel>[0];
}

function securityEvent(index: number): SecurityCenterEvent {
  return {
    id: `event-${index}`,
    organizationId: 'org-1',
    actorUserId: `user-${index}`,
    action: `security.custom.${index}`,
    resourceType: 'session',
    resourceId: `session-${index}`,
    createdAt: `2026-08-${String((index % 20) + 1).padStart(2, '0')}T12:00:00.000Z`,
    resolved: index % 2 === 0,
    note: index === 1 ? 'Reviewed by the incident lead' : undefined,
  };
}

afterEach(cleanup);

describe('OrganizationCapabilitiesPanel', () => {
  it('renders deterministic loading and recoverable permission states', () => {
    const retry = vi.fn();
    const { rerender } = render(<OrganizationCapabilitiesPanel {...props({ loading: true, onRetry: retry })} />);

    expect(screen.getByLabelText('Loading Enterprise capabilities')).toBeTruthy();
    expect(screen.getByLabelText('Loading Security Center events')).toBeTruthy();

    rerender(
      <OrganizationCapabilitiesPanel
        {...props({ capabilities: null, capabilitiesErrorKind: 'permission', onRetry: retry })}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('restricted');
    fireEvent.click(screen.getByRole('button', { name: 'Reload Enterprise capabilities' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows exact API states and does not simulate operator-required capabilities', () => {
    render(<OrganizationCapabilitiesPanel {...props()} />);

    expect(screen.getByRole('heading', { name: 'Enterprise capabilities' })).toBeTruthy();
    expect(screen.getByText('Single-tenant runtime')).toBeTruthy();
    expect(screen.getAllByText('Operator required')).toHaveLength(4);
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Security Center' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'No security events' })).toBeTruthy();
    expect(screen.queryByText(/sample|demo|simulated/iu)).toBeNull();
  });

  it('keeps Security Center operator-required explicit and retryable', () => {
    const retry = vi.fn();

    render(
      <OrganizationCapabilitiesPanel
        {...props({
          capabilities: {
            ...enterpriseCapabilities,
            capabilities: enterpriseCapabilities.capabilities.map((capability) =>
              capability.key === 'security-center'
                ? { ...capability, provisioned: false, state: 'operator-required', surface: null }
                : capability,
            ),
          },
          onRetry: retry,
        })}
      />,
    );

    expect(screen.getByText(/operator must explicitly provision Security Center/iu)).toBeTruthy();
    expect(screen.queryByTestId('security-center-panel')).toBeNull();
  });

  it('loads cursor pages, deduplicates stably, and keeps mobile/tablet controls touch-safe', () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => securityEvent(index + 1));
    const loadMore = vi.fn();
    const retryLoadMore = vi.fn();

    const { rerender } = render(
      <OrganizationCapabilitiesPanel
        {...props({
          securityEvents: firstPage,
          securityOpenCount: 11,
          securityNextCursor: 'opaque-cursor-value',
          onLoadMore: loadMore,
          onRetryLoadMore: retryLoadMore,
        })}
      />,
    );

    const capabilityGrid = screen.getByTestId('enterprise-capabilities-panel').querySelector('ul');
    const loadMoreButton = screen.getByRole('button', { name: 'Load more events' });

    expect(capabilityGrid?.className).toContain('sm:grid-cols-2');
    expect(loadMoreButton.className).toContain('min-h-[44px]');
    expect(screen.getByText('Reviewed by the incident lead')).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="security-center-panel"] li')).toHaveLength(20);

    fireEvent.click(loadMoreButton);
    expect(loadMore).toHaveBeenCalledOnce();

    const merged = mergeSecurityCenterEvents(firstPage, [firstPage[19], securityEvent(21)]);
    expect(merged).toHaveLength(21);
    expect(merged.map((event) => event.id)).toEqual([...firstPage.map((event) => event.id), 'event-21']);

    rerender(
      <OrganizationCapabilitiesPanel
        {...props({
          securityEvents: merged,
          securityOpenCount: 11,
          securityNextCursor: null,
          onLoadMore: loadMore,
          onRetryLoadMore: retryLoadMore,
        })}
      />,
    );
    expect(document.querySelectorAll('[data-testid="security-center-panel"] li')).toHaveLength(21);
    expect(screen.queryByRole('button', { name: 'Load more events' })).toBeNull();

    rerender(
      <OrganizationCapabilitiesPanel
        {...props({
          securityEvents: firstPage,
          securityOpenCount: 11,
          securityNextCursor: 'opaque-cursor-value',
          securityLoadMoreErrorKind: 'temporary',
          onLoadMore: loadMore,
          onRetryLoadMore: retryLoadMore,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading events' }));
    expect(retryLoadMore).toHaveBeenCalledOnce();
  });

  it('renders French copy while preserving identifiers and policy values', () => {
    render(
      <OrganizationCapabilitiesPanel
        {...props({
          copy: getOrganizationSecurityCopy('fr'),
          language: 'fr',
          securityEvents: [securityEvent(1)],
          securityOpenCount: 1,
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Capacités Enterprise' })).toBeTruthy();
    expect(screen.getAllByText('Opérateur requis')).toHaveLength(4);
    expect(screen.getByText('session-1')).toBeTruthy();
    expect(screen.getByText('user-1')).toBeTruthy();
    expect(screen.queryByText('Enterprise capabilities')).toBeNull();
  });
});
