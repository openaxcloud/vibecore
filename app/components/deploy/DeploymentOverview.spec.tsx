/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentOverview } from './DeploymentOverview';

vi.mock('react-qrcode-logo', () => ({ QRCode: () => null }));

afterEach(cleanup);

describe('DeploymentOverview', () => {
  it('shows an empty state when nothing is deployed', () => {
    render(<DeploymentOverview deployment={undefined} />);
    expect(screen.getByText(/not published yet/i)).toBeTruthy();
  });

  it('renders Production label→value rows for a deployment', () => {
    render(
      <DeploymentOverview
        deployment={{ status: 'READY', environment: 'production', url: 'https://api.e-code.ai/static-deployments/d1/' }}
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
    render(<DeploymentOverview deployment={{ status: 'READY' }} deploymentTypeId="autoscale" />);
    expect(screen.getByText('Autoscale')).toBeTruthy();
  });
});
