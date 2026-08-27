/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentOverview } from './DeploymentOverview';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('react-qrcode-logo', () => ({ QRCode: () => null }));

afterEach(cleanup);

function renderWithLocale(element: ReactElement, language: 'en' | 'fr' = 'en') {
  return render(<I18nextProvider i18n={createI18nInstance(language)}>{element}</I18nextProvider>);
}

describe('DeploymentOverview', () => {
  it('shows an empty state when nothing is deployed', () => {
    renderWithLocale(<DeploymentOverview deployment={undefined} />);
    expect(screen.getByText(/not published yet/i)).toBeTruthy();
  });

  it('renders Production label→value rows for a deployment', () => {
    renderWithLocale(
      <DeploymentOverview
        deployment={{
          status: 'READY',
          environment: 'production',
          url: 'https://api.e-code.ai/static-deployments/d1/',
          accessPolicy: { mode: 'PUBLIC', version: 1 },
        }}
        deploymentTypeId="static"
      />,
    );

    for (const label of ['Status', 'Visibility', 'Domain', 'Type', 'Environment']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('READY')).toBeTruthy();
    expect(screen.getByText('Public')).toBeTruthy();

    // Domain renders as a clickable live link.
    const link = screen.getByText('https://api.e-code.ai/static-deployments/d1/');
    expect(link.getAttribute('href')).toBe('https://api.e-code.ai/static-deployments/d1/');
  });

  it('labels the Type row from the selected tier', () => {
    renderWithLocale(<DeploymentOverview deployment={{ status: 'READY' }} deploymentTypeId="autoscale" />);
    expect(screen.getByText('Autoscale')).toBeTruthy();
  });

  it('renders localized French labels and formats a deployment timestamp', () => {
    renderWithLocale(
      <DeploymentOverview
        deployment={{ status: 'READY', environment: 'staging', finishedAt: '2026-08-04T12:30:00.000Z' }}
      />,
      'fr',
    );

    expect(screen.getByText('Statut')).toBeTruthy();
    expect(screen.getByText('PRÊT')).toBeTruthy();
    expect(screen.getByText('Visibilité')).toBeTruthy();
    expect(screen.getByText('préproduction')).toBeTruthy();
    expect(screen.queryByText('READY')).toBeNull();
  });
});
