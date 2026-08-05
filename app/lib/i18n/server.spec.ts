import { describe, expect, it } from 'vitest';

import type { TranslationKey } from './dictionary';
import { translateServerMessage } from './server';

describe('translateServerMessage', () => {
  it('returns professional French copy for request-scoped metadata', () => {
    expect(translateServerMessage('fr', 'auth.login.metaTitle')).toBe('Connexion - E-Code');
  });

  it('interpolates stable auth feedback without exposing a raw key', () => {
    expect(translateServerMessage('fr', 'auth.feedback.passwordTooShort', { count: 8 })).toBe(
      'Le mot de passe doit contenir au moins 8 caractères.',
    );
  });

  it('falls back to English when the selected catalog is incomplete', () => {
    expect(translateServerMessage('es', 'auth.verify.metaTitle')).toBe('Verify email - E-Code');
  });

  it('never exposes a raw implementation key when called with untrusted runtime input', () => {
    expect(translateServerMessage('fr', 'missing.runtime.key' as TranslationKey)).toBe('Unavailable');
  });
});
