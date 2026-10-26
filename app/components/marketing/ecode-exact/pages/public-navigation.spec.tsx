/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Bounties from './Bounties';
import PublicDeploymentsPage from './PublicDeploymentsPage';
import PublicTeamPage from './PublicTeamPage';
import { createI18nInstance } from '~/lib/i18n/runtime';

// Isolate page landmarks and actions; preserve actual Link/Button and Router rendering.
vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicNavbar: () => <nav aria-label="Public navigation" />,
  EcodeExactPublicFooter: () => <footer>Public footer</footer>,
}));

afterEach(cleanup);

describe('public page navigation semantics', () => {
  for (const language of ['fr', 'en'] as const) {
    for (const [name, Page, destinations] of [
      ['bounties', Bounties, ['/register', '/contact-sales', '/register', '/dashboard']],
      ['deployments', PublicDeploymentsPage, ['/contact-sales', '/docs', '/contact-sales', '/docs']],
      ['teams', PublicTeamPage, ['/register', '/contact-sales', '/register', '/pricing']],
    ] as const) {
      it(`${name} ${language} exposes one main and one interactive element per navigation action`, async () => {
        const { container } = render(
          <I18nextProvider i18n={createI18nInstance(language)}>
            <MemoryRouter>
              <Page />
            </MemoryRouter>
          </I18nextProvider>,
        );

        // Deployments includes a lazy section: assert its actions too, after mounting.
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(4));
        expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(destinations);
        expect(container.querySelectorAll('a button,button a')).toHaveLength(0);
        expect(screen.getAllByRole('main')).toHaveLength(1);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('main').contains(screen.getByRole('navigation'))).toBe(false);
        expect(screen.getByRole('main').contains(screen.getByRole('contentinfo'))).toBe(false);

        for (const link of screen.getAllByRole('link')) {
          expect(link.textContent?.trim()).not.toBe('');
          expect(screen.getByRole('main').contains(link)).toBe(true);
        }
      });
    }
  }
});
