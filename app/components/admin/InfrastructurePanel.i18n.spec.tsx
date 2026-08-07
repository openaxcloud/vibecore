/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { InfrastructurePanel, type InfrastructurePayload } from './InfrastructurePanel';
import { formatAdminInfrastructurePlural, getAdminInfrastructureCopy } from '~/lib/i18n/catalogs/admin-infrastructure';
import { createI18nInstance } from '~/lib/i18n/runtime';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

const payload: InfrastructurePayload = {
  available: true,
  capacity: {
    runningWorkspaces: 12_345,
    totalWorkspacePods: 1,
    workspacesByOrg: [{ orgId: 'org_customer_123', count: 7 }],
    nodePool: {
      name: 'sandbox-gvisor',
      nodeCount: 6,
      allocatableCpuMillicores: 2_000,
      allocatableMemoryBytes: 8 * 1024 ** 3,
      requestedCpuMillicores: 1_500,
      requestedMemoryBytes: 4 * 1024 ** 3,
      usedCpuMillicores: 1_250,
      usedMemoryBytes: 3 * 1024 ** 3,
      reservedCpuRatio: 0.96,
      reservedMemoryRatio: 0.5,
      usedCpuRatio: 0.625,
    },
    autoscaling: {
      nodePool: 'sandbox-gvisor',
      minNodes: 2,
      maxNodes: 6,
      currentNodes: 6,
      healthy: true,
    },
  },
  idleStopped: 2_345,
  alerts: [
    { level: 'critical', kind: 'node-count', message: 'RAW ENGLISH NODE ALERT' },
    { level: 'critical', kind: 'reserved-cpu', message: 'RAW ENGLISH CPU ALERT' },
    { level: 'warning', kind: 'future-kind', message: 'RAW ENGLISH UNKNOWN ALERT' },
  ],
  generatedAt: '2026-08-04T12:34:00.000Z',
};

afterEach(cleanup);

describe('InfrastructurePanel i18n', () => {
  it('renders live capacity in French and never exposes upstream alert prose', () => {
    const { container } = render(withLocale('fr', <InfrastructurePanel payload={payload} />));

    expect(screen.getByRole('heading', { name: 'Infrastructure et capacité' })).toBeTruthy();
    expect(screen.getByText(/pool d’espaces de travail «\s*sandbox-gvisor\s*»/u)).toBeTruthy();
    expect(screen.getByText(/^12\s*345$/u)).toBeTruthy();
    expect(screen.getByText('1 pod au total')).toBeTruthy();
    expect(screen.getByText(/^2\s*345$/u)).toBeTruthy();
    expect(screen.getByText('Opérationnel')).toBeTruthy();
    expect(screen.getByText('1,5 / 2,0 cœurs')).toBeTruthy();
    expect(screen.getByText(/4,0 \/ 8,0\s*Gio/u)).toBeTruthy();
    expect(screen.getByText('org_customer_123')).toBeTruthy();
    expect(screen.getByText(/4 août 2026/u)).toBeTruthy();

    expect(screen.getByText(/Le pool de nœuds/u).textContent).toContain('100 %');
    expect(screen.getByText(/Le CPU réservé/u).textContent).toContain('96 %');
    expect(screen.getByText(/Le cluster a signalé une alerte de capacité/u)).toBeTruthy();
    expect(document.body.textContent).not.toContain('RAW ENGLISH');

    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    expect(screen.getByRole('progressbar', { name: /CPU réservé.*96\s*%/u })).toBeTruthy();
    expect(container.querySelector('.grid-cols-1')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('overflow-x-hidden');
  });

  it('renders the unavailable state in French', () => {
    render(withLocale('fr', <InfrastructurePanel payload={{ available: false }} />));

    expect(screen.getByRole('heading', { name: 'Infrastructure' })).toBeTruthy();
    expect(screen.getByText(/métriques de capacité en direct sont temporairement indisponibles/u)).toBeTruthy();
    expect(screen.queryByText(/Live capacity metrics/u)).toBeNull();
  });

  it('keeps complete English fallback and locale-aware plurals', () => {
    const copy = getAdminInfrastructureCopy('de-DE');

    expect(copy['adminInfrastructure.page.title']).toBe('Infrastructure & capacity');
    expect(
      formatAdminInfrastructurePlural('fr', 2, {
        one: getAdminInfrastructureCopy('fr')['adminInfrastructure.stat.pods_one'],
        other: getAdminInfrastructureCopy('fr')['adminInfrastructure.stat.pods_other'],
      }),
    ).toBe('2 pods au total');
  });
});
