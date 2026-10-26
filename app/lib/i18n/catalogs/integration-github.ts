import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const integrationGithubEn = {
  title: 'Verify my existing GitHub account',
  scope: 'This checks your personal account now. It does not synchronize this project.',
  unverified: 'Account not verified.',
  verify: 'Verify my existing GitHub account',
  loading: 'Verifying your GitHub account…',
  verified: 'Personal account verified:',
  checkedAt: 'Checked at',
  error:
    'Your GitHub account could not be verified. Check your existing account connection in settings, then try again.',
  retry: 'Try verification again',
} as const;

export type IntegrationGithubCopy = Readonly<Record<keyof typeof integrationGithubEn, string>>;

export const integrationGithubFr: IntegrationGithubCopy = {
  title: 'Vérifier mon compte GitHub existant',
  scope: 'Cette vérification porte sur votre compte personnel à cet instant. Elle ne synchronise pas ce projet.',
  unverified: 'Compte non vérifié.',
  verify: 'Vérifier mon compte GitHub existant',
  loading: 'Vérification de votre compte GitHub…',
  verified: 'Compte personnel vérifié :',
  checkedAt: 'Vérifié le',
  error:
    'Impossible de vérifier votre compte GitHub. Vérifiez la connexion de votre compte existant dans les paramètres, puis réessayez.',
  retry: 'Réessayer la vérification',
};

export function getIntegrationGithubCopy(language?: string | null): IntegrationGithubCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? integrationGithubFr : integrationGithubEn;
}
