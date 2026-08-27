/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseWorkbench } from './DatabaseWorkbench';

type Fetcher = {
  state: 'idle' | 'loading' | 'submitting';
  data?: unknown;
  load: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
};

let language = 'fr';
let fetchers: Fetcher[] = [];
let fetcherCall = 0;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('react-router', () => ({
  useFetcher: () => {
    const fetcher = fetchers[fetcherCall % fetchers.length];
    fetcherCall += 1;

    return fetcher;
  },
}));

vi.mock('./DatabaseSettings', () => ({ DatabaseSettings: () => <div /> }));
vi.mock('./DatabaseStudio', () => ({ DatabaseStudio: () => <div /> }));

function makeFetcher(data?: unknown, state: Fetcher['state'] = 'idle'): Fetcher {
  return { state, data, load: vi.fn(), submit: vi.fn() };
}

describe('DatabaseWorkbench i18n', () => {
  beforeEach(() => {
    language = 'fr';
    fetcherCall = 0;
  });

  afterEach(cleanup);

  it('renders the complete French empty state and preserves the Postgres product name', () => {
    fetchers = [makeFetcher({ environments: [] }), makeFetcher()];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'Toutes les bases de données' })).toBeTruthy();
    expect(screen.getByText('Aucune base de données pour le moment')).toBeTruthy();
    expect(screen.getByText(/Postgres gérée/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer une base de données' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('No database yet');
  });

  it('masks raw list and provisioning errors with localized recovery copy', () => {
    fetchers = [makeFetcher({ error: 'database password leaked by upstream' }), makeFetcher({ error: 'raw' })];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les bases de données.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('password leaked');
    expect(document.body.textContent).not.toContain('raw');
  });

  it('keeps English as the fallback locale', () => {
    language = 'de';
    fetchers = [makeFetcher({ environments: [] }), makeFetcher({ error: 'raw' })];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'All databases' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create database' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Could not create the database. Try again.');
  });
});
