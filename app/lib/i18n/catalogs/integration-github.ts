import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const integrationGithubEn = {
  'integrationGithub.title': 'Verify my existing GitHub account',
  'integrationGithub.scope': 'This checks your personal account now. It does not synchronize this project.',
  'integrationGithub.unverified': 'Account not verified.',
  'integrationGithub.verify': 'Verify my existing GitHub account',
  'integrationGithub.loading': 'Verifying your GitHub account…',
  'integrationGithub.verified': 'Personal account verified:',
  'integrationGithub.checkedAt': 'Checked at',
  'integrationGithub.error':
    'Your GitHub account could not be verified. Check your existing account connection in settings, then try again.',
  'integrationGithub.retry': 'Try verification again',
} as const;

export type IntegrationGithubCopy = {
  readonly [K in keyof typeof integrationGithubEn as K extends `integrationGithub.${infer Name}`
    ? Name
    : never]: string;
};

export const integrationGithubFr: Readonly<Record<keyof typeof integrationGithubEn, string>> = {
  'integrationGithub.title': 'Vérifier mon compte GitHub existant',
  'integrationGithub.scope':
    'Cette vérification porte sur votre compte personnel à cet instant. Elle ne synchronise pas ce projet.',
  'integrationGithub.unverified': 'Compte non vérifié.',
  'integrationGithub.verify': 'Vérifier mon compte GitHub existant',
  'integrationGithub.loading': 'Vérification de votre compte GitHub…',
  'integrationGithub.verified': 'Compte personnel vérifié :',
  'integrationGithub.checkedAt': 'Vérifié le',
  'integrationGithub.error':
    'Impossible de vérifier votre compte GitHub. Vérifiez la connexion de votre compte existant dans les paramètres, puis réessayez.',
  'integrationGithub.retry': 'Réessayer la vérification',
};

export function getIntegrationGithubCopy(language?: string | null): IntegrationGithubCopy {
  const catalog = normalizeSupportedLanguage(language) === 'fr' ? integrationGithubFr : integrationGithubEn;

  return {
    title: catalog['integrationGithub.title'],
    scope: catalog['integrationGithub.scope'],
    unverified: catalog['integrationGithub.unverified'],
    verify: catalog['integrationGithub.verify'],
    loading: catalog['integrationGithub.loading'],
    verified: catalog['integrationGithub.verified'],
    checkedAt: catalog['integrationGithub.checkedAt'],
    error: catalog['integrationGithub.error'],
    retry: catalog['integrationGithub.retry'],
  };
}
