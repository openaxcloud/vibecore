import { describe, expect, it } from 'vitest';
import { classifyGitCloneFailure } from './useGit';
import { formatGitCloneCopy, getGitCloneCopy, gitCloneEn, gitCloneFr } from '~/lib/i18n/catalogs/git-clone';

describe('useGit i18n safety', () => {
  it('keeps complete EN/FR catalog parity and English fallback', () => {
    expect(Object.keys(gitCloneFr).sort()).toEqual(Object.keys(gitCloneEn).sort());
    expect(getGitCloneCopy('de')).toBe(gitCloneEn);
    expect(getGitCloneCopy('fr-CA')).toBe(gitCloneFr);
  });

  it('interpolates repository hosts without translating or exposing credentials', () => {
    const message = formatGitCloneCopy(getGitCloneCopy('fr')['gitClone.error.authenticationHost'], {
      host: 'github.com',
    });
    expect(message).toBe(
      'Échec de l’authentification auprès de github.com. Vérifiez vos identifiants, puis réessayez.',
    );
  });

  it('classifies technical failures without relying on localized user copy', () => {
    expect(classifyGitCloneFailure(new Error('Authentication failed for github.com'))).toBe('authentication');
    expect(classifyGitCloneFailure(new Error('connect ETIMEDOUT 140.82.121.4'))).toBe('network');
    expect(classifyGitCloneFailure(new Error('HTTP Error: 404'))).toBe('not-found');
    expect(classifyGitCloneFailure(new Error('HTTP Error: 401'))).toBe('unauthorized');
    expect(classifyGitCloneFailure(new Error('unexpected provider payload'))).toBe('generic');
  });
});
