/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { GitStatusBadge, GitStatusLegend } from './GitStatusBadge';
import { createI18nInstance } from '~/lib/i18n/runtime';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

describe('<GitStatusBadge />', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows untracked Git porcelain status as U with an explicit tooltip', () => {
    render(<GitStatusBadge status="??" />);

    const badge = screen.getByLabelText(/Git status U = Untracked/i);

    expect(badge.textContent).toContain('U');
    expect(badge.textContent).not.toContain('??');
    expect(badge.getAttribute('title')).toContain('U = Untracked');
    expect(badge.getAttribute('title')).toContain('New file not added to Git yet');
  });

  it('renders a readable legend without exposing raw question-mark status codes', () => {
    render(<GitStatusLegend />);

    expect(screen.getByText('Status guide:')).toBeTruthy();
    expect(screen.getAllByText('Untracked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Modified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0);
    expect(screen.queryByText('??')).toBeNull();
  });

  it('renders the badge and wrapping legend in French while preserving Git codes', () => {
    render(withLocale('fr', <GitStatusLegend />));

    const title = screen.getByText(/Guide des états\s*:/u);
    expect(title).toBeTruthy();
    expect(screen.getAllByText('Non suivi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Modifié').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ajouté').length).toBeGreaterThan(0);

    const badge = screen.getByLabelText(/État Git U = Non suivi/u);
    expect(badge.getAttribute('title')).toContain('Nouveau fichier pas encore ajouté à Git.');
    expect(badge.textContent).toContain('U');
    expect(badge.textContent).not.toContain('??');
    expect(title.parentElement?.className).toContain('overflow-x-hidden');
  });
});
