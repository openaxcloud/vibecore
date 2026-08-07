/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPLOY_VIEWS, DeploySubNav } from './DeploySubNav';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';

afterEach(cleanup);

describe('DeploySubNav', () => {
  it('renders the four Replit views in order', () => {
    render(<DeploySubNav active="overview" onSelect={vi.fn()} />);
    expect(DEPLOY_VIEWS.map((v) => v.label)).toEqual(['Overview', 'Logs', 'Domains', 'Manage']);

    for (const v of DEPLOY_VIEWS) {
      expect(screen.getByTestId(`deploy-view-${v.id}`)).toBeTruthy();
    }
  });

  it('marks the active tab selected', () => {
    render(<DeploySubNav active="logs" onSelect={vi.fn()} />);
    expect(screen.getByTestId('deploy-view-logs').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('deploy-view-overview').getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelect with the clicked view', () => {
    const onSelect = vi.fn();
    render(<DeploySubNav active="overview" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('deploy-view-domains'));
    expect(onSelect).toHaveBeenCalledWith('domains');
  });

  it('renders caller-provided French labels and accessible name', () => {
    const copy = getProjectDeploymentsCopy('fr');

    render(
      <DeploySubNav
        active="overview"
        onSelect={vi.fn()}
        ariaLabel={copy.navigation.aria}
        labels={{
          overview: copy.navigation.overview,
          logs: copy.navigation.logs,
          domains: copy.navigation.domains,
          manage: copy.navigation.manage,
        }}
      />,
    );

    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe('Vues des déploiements');
    expect(screen.getByText('Vue d’ensemble')).toBeTruthy();
    expect(screen.getByText('Domaines')).toBeTruthy();
    expect(screen.getByText('Gérer')).toBeTruthy();
    expect(screen.queryByText('Overview')).toBeNull();
    expect(screen.getByRole('tablist').className).toContain('overflow-x-auto');
    expect(screen.getByTestId('deploy-view-overview').className).toContain('whitespace-nowrap');
  });
});
