/**
 * @vitest-environment jsdom
 */

import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubErrorBoundary, useGitHubErrorHandler } from './GitHubErrorBoundary';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function BrokenGitHubPanel(): never {
  throw new Error('Raw English failure secret=github_pat_private');
}

describe('GitHubErrorBoundary', () => {
  beforeEach(() => {
    language = 'en';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a localized recovery state without exposing raw exception details', () => {
    language = 'fr';

    render(
      <GitHubErrorBoundary>
        <BrokenGitHubPanel />
      </GitHubErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Erreur d’intégration GitHub')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeTruthy();
    expect(screen.queryByText(/github_pat_private/u)).toBeNull();
    expect(screen.queryByText(/Show error details/u)).toBeNull();
  });

  it('uses the English fallback for unsupported locales', () => {
    language = 'es';

    render(
      <GitHubErrorBoundary>
        <BrokenGitHubPanel />
      </GitHubErrorBoundary>,
    );

    expect(screen.getByText('GitHub Integration Error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('returns a safe localized message from the async error handler', () => {
    language = 'fr';

    const { result } = renderHook(() => useGitHubErrorHandler());

    expect(result.current.handleError(new Error('Raw English secret'), 'stats')).toBe(
      'Impossible d’établir la connexion. Vérifiez vos paramètres, puis réessayez.',
    );
  });
});
