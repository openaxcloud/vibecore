/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPLOY_VIEWS, DeploySubNav } from './DeploySubNav';

afterEach(cleanup);

describe('DeploySubNav', () => {
  it('renders the four Replit views in order', () => {
    render(<DeploySubNav active="overview" onSelect={() => {}} />);
    expect(DEPLOY_VIEWS.map((v) => v.label)).toEqual(['Overview', 'Logs', 'Domains', 'Manage']);

    for (const v of DEPLOY_VIEWS) {
      expect(screen.getByTestId(`deploy-view-${v.id}`)).toBeTruthy();
    }
  });

  it('marks the active tab selected', () => {
    render(<DeploySubNav active="logs" onSelect={() => {}} />);
    expect(screen.getByTestId('deploy-view-logs').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('deploy-view-overview').getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelect with the clicked view', () => {
    const onSelect = vi.fn();
    render(<DeploySubNav active="overview" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('deploy-view-domains'));
    expect(onSelect).toHaveBeenCalledWith('domains');
  });
});
