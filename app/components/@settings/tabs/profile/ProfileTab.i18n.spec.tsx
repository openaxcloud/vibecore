/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { toast } from 'react-toastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfileTab from './ProfileTab';
import { profileTabEn, profileTabFr } from '~/lib/i18n/catalogs/profile-tab';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { profileStore } from '~/lib/stores/profile';

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  profileStore.set({ username: '', bio: '', avatar: '' });
});

function renderInFrench() {
  const i18n = createI18nInstance('fr');

  return render(
    <I18nextProvider i18n={i18n}>
      <ProfileTab />
    </I18nextProvider>,
  );
}

describe('ProfileTab i18n', () => {
  it('keeps complete catalog parity', () => {
    expect(Object.keys(profileTabFr).sort()).toEqual(Object.keys(profileTabEn).sort());
  });

  it('renders French labels, placeholders, and an accessible avatar control', () => {
    profileStore.set({
      username: 'Avi',
      bio: 'Créateur',
      avatar: 'data:image/png;base64,aGVsbG8=',
    });
    renderInFrench();

    expect(screen.getByText('Photo de profil')).toBeTruthy();
    expect(screen.getByText('Importez une photo de profil ou un avatar.')).toBeTruthy();
    expect(screen.getByAltText('Photo de profil de Avi')).toBeTruthy();
    expect(screen.getByLabelText('Choisir une photo de profil')).toBeTruthy();
    expect(screen.getByLabelText('Nom d’utilisateur').getAttribute('placeholder')).toBe(
      'Saisissez votre nom d’utilisateur',
    );
    expect(screen.getByLabelText('Biographie').getAttribute('placeholder')).toBe('Présentez-vous en quelques mots');
    expect(document.body.textContent).not.toMatch(/Profile Picture|Username|Tell us about yourself/);
  });

  it('announces a debounced profile update in the active language', () => {
    vi.useFakeTimers();
    renderInFrench();

    fireEvent.change(screen.getByLabelText('Nom d’utilisateur'), { target: { value: 'Avi' } });
    vi.advanceTimersByTime(1_001);

    expect(toast.success).toHaveBeenCalledWith('Nom d’utilisateur mis à jour');
  });
});
