/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  data: {
    language: 'fr',
    teamId: 'team_customer_42',
    basePath: '/teams/team_customer_42',
    entries: [],
    listError: false,
    forbidden: false,
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useLoaderData: () => routeState.data,
  };
});

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({
    title,
    description,
    children,
  }: {
    title: string;
    description: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('~/components/teams/TeamAccessLogPanel', () => ({
  TeamAccessLogPanel: ({ teamId }: { teamId: string }) => <section data-testid="access-log">{teamId}</section>,
}));

import TeamAccessLogRoute, { meta as overviewMeta } from './teams.$id';
import TeamSettingsRoute, { meta as settingsMeta } from './teams.$id.settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => cleanup());

describe('team routes i18n', () => {
  it('switches the team access-log route live while preserving the team identifier', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <TeamAccessLogRoute />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Journal des accès de l’équipe' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres de l’équipe' }).getAttribute('href')).toBe(
      '/teams/team_customer_42/settings',
    );
    expect(screen.getByTestId('access-log').textContent).toBe('team_customer_42');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Team access log' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open team settings' })).toBeTruthy();
  });

  it('renders the complete French team-settings route with a wrap-safe full-log link', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <TeamSettingsRoute />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Paramètres de l’équipe' })).toBeTruthy();
    expect(screen.getByText('Journal des accès de l’équipe team_customer_42.')).toBeTruthy();

    const link = screen.getByRole('link', { name: 'Ouvrir le journal complet des accès de l’équipe' });

    expect(link.getAttribute('href')).toBe('/teams/team_customer_42');
    expect(link.className).toContain('min-h-[44px]');
  });

  it('emits French SEO, canonical and hreflang metadata for both routes', () => {
    const overviewTags = overviewMeta({
      data: { language: 'fr' },
      matches: [],
      params: { id: 'team/42' },
    } as never);
    const settingsTags = settingsMeta({
      data: { language: 'fr' },
      matches: [],
      params: { id: 'team/42' },
    } as never);

    expect(overviewTags).toContainEqual({ title: 'Journal des accès de l’équipe · team/42 · E-Code' });
    expect(overviewTags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(overviewTags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/teams/team%2F42',
    });
    expect(settingsTags).toContainEqual({ title: 'Paramètres de l’équipe · team/42 · E-Code' });
    expect(settingsTags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/teams/team%2F42/settings?lang=fr',
    });
  });
});
