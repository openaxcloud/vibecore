/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthField, AuthScreen } from './AuthScreen';
import { PasswordStrengthMeter } from './PasswordStrength';
import { createI18nInstance } from '~/lib/i18n/runtime';

function FrenchAuthHarness() {
  const { t } = useTranslation();

  return (
    <AuthScreen
      eyebrow={t('auth.login.eyebrow')}
      title={t('auth.login.title')}
      description={t('auth.login.description')}
    >
      <AuthField label={t('auth.common.password')} name="password" type="password" />
      <PasswordStrengthMeter password="CorrectHorse1!" />
    </AuthScreen>
  );
}

describe('French auth rendering', () => {
  it('renders shell defaults, form vocabulary and password guidance from the French catalog', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <MemoryRouter>
          <FrenchAuthHarness />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Ravi de vous revoir' })).toBeInTheDocument();
    expect(screen.getByText('Espace de travail de développement assisté par IA')).toBeInTheDocument();
    expect(screen.getByText('Sécurité de niveau entreprise')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Robustesse du mot de passe' })).toHaveAttribute(
      'aria-valuetext',
      'Robuste',
    );
    expect(screen.getByText('Au moins 8 caractères (obligatoire)')).toBeInTheDocument();
    expect(screen.queryByText('AI development workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Password strength')).not.toBeInTheDocument();
  });

  it('selects French singular and plural countdown forms', () => {
    const i18n = createI18nInstance('fr');

    expect(i18n.t('auth.verify.resendAvailable', { count: 1 })).toBe('Nouvel envoi disponible dans 1 seconde');
    expect(i18n.t('auth.verify.resendAvailable', { count: 12 })).toBe('Nouvel envoi disponible dans 12 secondes');
  });
});
