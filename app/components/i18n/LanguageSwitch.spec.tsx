/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLanguageSwitchUrl, LanguageSwitch } from './LanguageSwitch';
import { createI18nInstance } from '~/lib/i18n/runtime';

describe('LanguageSwitch', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { configurable: true, writable: true, value: '' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ language: 'fr' }))));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('exposes English and French with the active locale', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <LanguageSwitch />
      </I18nextProvider>,
    );

    expect(screen.getByRole('group', { name: "Choisir la langue d'affichage" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Langue actuelle : Français' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Anglais' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('persists a manual choice locally and for authenticated background work', async () => {
    const onLanguageChange = vi.fn();

    render(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <LanguageSwitch onLanguageChange={onLanguageChange} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'French' }));

    expect(document.cookie).toContain('vibecore-lang=fr');
    expect(onLanguageChange).toHaveBeenCalledWith('fr');
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/user/preferences',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ language: 'fr' }), keepalive: true }),
      ),
    );
  });

  /*
   * The group already declared min-h-[44px], but its own padding shrank the
   * buttons — the actual tap targets — to 40x36 on the deployed marketing
   * shell. Only the interactive element counts towards the >=44px rule.
   */
  it('gives each locale button a tap target of at least 44px', () => {
    const { container } = render(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <LanguageSwitch />
      </I18nextProvider>,
    );

    // This suite renders without auto-cleanup, so scope queries to this render.
    const { getByRole, getByTestId } = within(container);

    for (const name of ['Current language: English', 'French']) {
      const button = getByRole('button', { name });

      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
      expect(button.className).not.toContain('min-h-[36px]');
      expect(button.className).not.toContain('min-w-[40px]');
    }

    expect(getByTestId('language-switch').className).not.toMatch(/\bp-1\b/);
  });

  it('replaces a conflicting locale query while preserving route state and the hash', () => {
    expect(buildLanguageSwitchUrl('https://e-code.ai/gallery?q=typescript&lang=fr#featured', 'en')).toBe(
      'https://e-code.ai/gallery?q=typescript&lang=en#featured',
    );
    expect(buildLanguageSwitchUrl('https://e-code.ai/pricing?ref=nav', 'fr')).toBe(
      'https://e-code.ai/pricing?ref=nav&lang=fr',
    );
  });
});
