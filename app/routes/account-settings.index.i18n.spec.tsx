/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  actionData: { errorCode: 'invalidTimezone' } as unknown,
  navigationState: 'idle',
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      className,
      onSubmit,
    }: {
      children: ReactNode;
      className?: string;
      onSubmit?: FormEventHandler;
    }) => (
      <form className={className} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => ({ user: { name: 'Avi', email: 'avi@example.com', timezone: 'Europe/Paris' } }),
    useNavigation: () => ({ state: routeState.navigationState }),
  };
});

vi.mock('~/lib/use-unsaved-guard', () => ({
  useUnsavedChangesGuard: () => ({ state: 'blocked', reset: vi.fn(), proceed: vi.fn() }),
}));

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    title,
    description,
    confirmLabel,
  }: {
    title: string;
    description: string;
    confirmLabel: string;
  }) => (
    <section aria-label={title}>
      <p>{description}</p>
      <button type="button">{confirmLabel}</button>
    </section>
  ),
}));

import AccountSettingsIndex, { meta } from './account-settings._index';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  routeState.actionData = { errorCode: 'invalidTimezone' };
  routeState.navigationState = 'idle';
});

describe('account profile settings i18n', () => {
  it('switches fields, feedback and unsaved-change copy live without changing profile data', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <AccountSettingsIndex />
      </I18nextProvider>,
    );

    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('Avi');
    expect((screen.getByLabelText('Adresse e-mail') as HTMLInputElement).value).toBe('avi@example.com');
    expect(screen.getByRole('button', { name: 'Enregistrer les modifications' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Sélectionnez un fuseau horaire IANA valide.');
    expect(screen.getByRole('region', { name: 'Abandonner les modifications ?' })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Discard changes?' })).toBeTruthy();
  });

  it('emits French account-profile SEO, canonical and hreflang metadata', () => {
    const tags = meta({ data: { language: 'fr' }, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Paramètres du profil — E-Code' });
    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/account-settings' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/account-settings?lang=fr',
    });
  });
});
