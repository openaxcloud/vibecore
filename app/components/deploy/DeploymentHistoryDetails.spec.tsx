/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentHistoryDetails } from './DeploymentHistoryDetails';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }));
afterEach(cleanup);
describe('deployment historical evidence', () => {
  it('retains commit, branch, framework, rollback target, duration and timestamped logs', () => {
    const { container } = render(
      <DeploymentHistoryDetails
        deployment={{
          id: 'release',
          framework: 'vite',
          branch: 'release-branch',
          commitSha: '123456789abcdef',
          rolledBackFromId: 'prior-release',
          startedAt: '2026-10-25T10:00:00Z',
          finishedAt: '2026-10-25T10:01:12Z',
          customDomain: 'isolated.example.com',
          logs: [{ timestamp: '2026-10-25T10:00:20Z', level: 'warn', message: 'Synthetic warning' }],
        }}
      />,
    );
    expect(screen.getByText('vite')).toBeTruthy();
    expect(screen.getByText('release-branch')).toBeTruthy();
    expect(screen.getByTitle('123456789abcdef').textContent).toBe('1234567');
    expect(screen.getByText('1m 12s')).toBeTruthy();
    expect(container.querySelector('[title*="prior-release"]')).toBeTruthy();
    expect(container.querySelector('pre')?.textContent).toContain('2026-10-25T10:00:20Z warn: Synthetic warning');
    expect(container.querySelector('details')?.open).toBe(false);
  });
});
