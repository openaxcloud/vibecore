export const impersonationBannerEn = {
  'impersonationBanner.status.loading': 'Checking the active session…',
  'impersonationBanner.message': 'Viewing the platform as {account} in an admin impersonation session.',
  'impersonationBanner.account.fallback': 'another account',
  'impersonationBanner.stop.action': 'Stop impersonating',
  'impersonationBanner.stop.loading': 'Stopping impersonation…',
  'impersonationBanner.stop.error': 'Could not stop impersonation — try again.',
} as const;

export type ImpersonationBannerKey = keyof typeof impersonationBannerEn;
export type ImpersonationBannerCopy = Readonly<Record<ImpersonationBannerKey, string>>;

export const impersonationBannerFr: ImpersonationBannerCopy = {
  'impersonationBanner.status.loading': 'Vérification de la session active…',
  'impersonationBanner.message':
    'Vous consultez la plateforme avec le compte {account} dans une session d’usurpation administrateur.',
  'impersonationBanner.account.fallback': 'un autre compte',
  'impersonationBanner.stop.action': 'Arrêter l’usurpation',
  'impersonationBanner.stop.loading': 'Arrêt de l’usurpation…',
  'impersonationBanner.stop.error': 'Impossible d’arrêter la session d’usurpation. Réessayez.',
};
