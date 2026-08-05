/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImpersonationBanner } from './ImpersonationBanner';
import { impersonationBannerEn, impersonationBannerFr } from '~/lib/i18n/catalogs/impersonation-banner';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { createI18nInstance } from '~/lib/i18n/runtime';

type FetcherState = 'idle' | 'loading' | 'submitting';

type StatusData = {
  impersonatedBy: string | null;
  email: string | null;
};

type StopData = {
  stopped: boolean;
  error?: string;
};

const harness = vi.hoisted(() => ({
  fetcherCall: 0,
  status: {
    state: 'idle' as FetcherState,
    data: undefined as StatusData | undefined,
    load: vi.fn(),
  },
  stop: {
    state: 'idle' as FetcherState,
    data: undefined as StopData | undefined,
  },
}));

vi.mock('react-router', () => ({
  useFetcher: () => {
    const fetcher = harness.fetcherCall++ % 2 === 0 ? harness.status : harness.stop;

    return {
      ...fetcher,
      Form: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    };
  },
}));

function createTestI18n(language: SupportedLanguage) {
  const instance = createI18nInstance(language);

  instance.addResourceBundle('en', 'translation', impersonationBannerEn, true, true);
  instance.addResourceBundle('fr', 'translation', impersonationBannerFr, true, true);

  return instance;
}

function renderBanner(language: SupportedLanguage = 'en') {
  const i18n = createTestI18n(language);

  const view = render(
    <I18nextProvider i18n={i18n}>
      <ImpersonationBanner />
    </I18nextProvider>,
  );

  return { ...view, i18n };
}

beforeEach(() => {
  harness.fetcherCall = 0;
  harness.status.state = 'idle';
  harness.status.data = undefined;
  harness.status.load.mockReset();
  harness.stop.state = 'idle';
  harness.stop.data = undefined;
});

afterEach(cleanup);

describe('<ImpersonationBanner /> i18n', () => {
  it('keeps complete EN/FR catalog and interpolation parity', () => {
    expect(Object.keys(impersonationBannerFr).sort()).toEqual(Object.keys(impersonationBannerEn).sort());
    expect(impersonationBannerEn['impersonationBanner.message'].match(/\{\w+\}/gu)).toEqual(['{account}']);
    expect(impersonationBannerFr['impersonationBanner.message'].match(/\{\w+\}/gu)).toEqual(['{account}']);
  });

  it('announces the initial check without flashing a visible banner', () => {
    renderBanner('fr');

    const loadingStatus = screen.getByTestId('impersonation-banner-loading');

    expect(loadingStatus.textContent).toBe('Vérification de la session active…');
    expect(loadingStatus.className).toContain('sr-only');
    expect(screen.queryByTestId('impersonation-banner')).toBeNull();
    expect(harness.status.load).toHaveBeenCalledOnce();
    expect(harness.status.load).toHaveBeenCalledWith('/api/impersonation');
  });

  it('renders nothing for a normal session after the status check', () => {
    harness.status.data = { impersonatedBy: null, email: 'member@example.com' };

    const { container } = renderBanner('fr');

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('impersonation-banner-loading')).toBeNull();
    expect(harness.status.load).not.toHaveBeenCalled();
  });

  it('renders complete French copy while preserving the impersonated email', () => {
    harness.status.data = { impersonatedBy: 'admin-123', email: 'person+client@example.com' };

    renderBanner('fr');

    const banner = screen.getByTestId('impersonation-banner');
    const button = screen.getByRole('button', { name: 'Arrêter l’usurpation' });
    const form = button.closest('form');

    expect(banner.textContent).toContain(
      'Vous consultez la plateforme avec le compte person+client@example.com dans une session d’usurpation administrateur.',
    );
    expect(banner.textContent).not.toContain('Viewing the platform');
    expect(banner.className).toContain('flex-wrap');
    expect(banner.className).toContain('status-warning-bg');
    expect(button.className).toContain('min-h-[44px]');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/api/impersonation');
  });

  it('uses a localized generic account and switches the rendered copy live', async () => {
    harness.status.data = { impersonatedBy: 'admin-123', email: null };

    const { i18n } = renderBanner('fr');

    expect(screen.getByTestId('impersonation-banner').textContent).toContain('un autre compte');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByTestId('impersonation-banner').textContent).toContain('another account');
    expect(screen.getByRole('button', { name: 'Stop impersonating' })).toBeTruthy();
  });

  it('exposes an accessible stop state and never renders raw response details', () => {
    harness.status.data = { impersonatedBy: 'admin-123', email: 'person@example.com' };
    harness.stop.state = 'submitting';
    harness.stop.data = { stopped: false, error: 'Raw backend English stack detail' };

    const { unmount } = renderBanner('fr');
    const stoppingButton = screen.getByRole('button', { name: 'Arrêt de l’usurpation…' });

    expect((stoppingButton as HTMLButtonElement).disabled).toBe(true);
    expect(stoppingButton.getAttribute('aria-busy')).toBe('true');
    expect(document.body.textContent).not.toContain('Raw backend English stack detail');

    unmount();
    harness.fetcherCall = 0;
    harness.stop.state = 'idle';
    harness.stop.data = { stopped: false, error: 'Raw backend English stack detail' };
    renderBanner('fr');

    expect(screen.getByRole('alert').textContent).toBe('Impossible d’arrêter la session d’usurpation. Réessayez.');
    expect(document.body.textContent).not.toContain('Raw backend English stack detail');
  });
});
