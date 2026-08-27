import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const mfaSetupEn = {
  'mfaSetup.metaTitle': 'Two-factor authentication - E-Code',
  'mfaSetup.errors.passwordMismatch': 'That password did not match. Try again.',
  'mfaSetup.errors.invalidCode': 'That code did not match. Check your authenticator app and try again.',
  'mfaSetup.errors.recoveryCodes':
    'Two-factor authentication is on, but recovery codes could not be generated. Visit Recovery codes to create them.',
  'mfaSetup.copy.copy': 'Copy',
  'mfaSetup.copy.copied': 'Copied',
  'mfaSetup.copy.all': 'Copy all',
  'mfaSetup.download': 'Download',
  'mfaSetup.download.heading': 'E-Code recovery codes',
  'mfaSetup.complete.title': 'Two-factor authentication is on',
  'mfaSetup.complete.description': 'Save your recovery codes. Each one works once if you lose your authenticator.',
  'mfaSetup.complete.badge': 'Two-factor authentication enabled',
  'mfaSetup.recovery.title': 'Recovery codes',
  'mfaSetup.recovery.description':
    'Store these codes in your password manager. Each one can be used once if you lose access to your authenticator.',
  'mfaSetup.complete.done': 'Done',
  'mfaSetup.securitySettings': 'Security settings',
  'mfaSetup.enabled.title': 'Two-factor authentication',
  'mfaSetup.enabled.description': 'Your account is protected with an authenticator app.',
  'mfaSetup.enabled.badge': 'Two-factor authentication is enabled',
  'mfaSetup.enabled.disable': 'Disable in Security settings',
  'mfaSetup.reauth.title': 'Confirm your password',
  'mfaSetup.reauth.description':
    'For your security, confirm your password before setting up two-factor authentication.',
  'mfaSetup.reauth.password': 'Password',
  'mfaSetup.reauth.confirming': 'Confirming…',
  'mfaSetup.reauth.continue': 'Continue',
  'mfaSetup.setup.title': 'Set up two-factor authentication',
  'mfaSetup.setup.description':
    'Scan the QR code with an authenticator app (Google Authenticator, 1Password or Authy), then enter the 6-digit code.',
  'mfaSetup.setup.qrAria': 'Authenticator setup QR code',
  'mfaSetup.setup.cannotScan': 'Cannot scan it?',
  'mfaSetup.setup.manual': 'Enter this setup key manually in your authenticator app.',
  'mfaSetup.setup.code': '6-digit code',
  'mfaSetup.setup.enabling': 'Enabling…',
  'mfaSetup.setup.enable': 'Enable two-factor authentication',
} as const;

export type MfaSetupKey = keyof typeof mfaSetupEn;
export type MfaSetupCopy = Readonly<Record<MfaSetupKey, string>>;

export const mfaSetupFr: MfaSetupCopy = {
  'mfaSetup.metaTitle': 'Authentification à deux facteurs - E-Code',
  'mfaSetup.errors.passwordMismatch': 'Ce mot de passe ne correspond pas. Réessayez.',
  'mfaSetup.errors.invalidCode':
    'Ce code ne correspond pas. Vérifiez votre application d’authentification, puis réessayez.',
  'mfaSetup.errors.recoveryCodes':
    'L’authentification à deux facteurs est activée, mais les codes de récupération n’ont pas pu être générés. Accédez aux Codes de récupération pour les créer.',
  'mfaSetup.copy.copy': 'Copier',
  'mfaSetup.copy.copied': 'Copié',
  'mfaSetup.copy.all': 'Tout copier',
  'mfaSetup.download': 'Télécharger',
  'mfaSetup.download.heading': 'Codes de récupération E-Code',
  'mfaSetup.complete.title': 'L’authentification à deux facteurs est activée',
  'mfaSetup.complete.description':
    'Enregistrez vos codes de récupération. Chacun fonctionne une seule fois si vous perdez votre authentificateur.',
  'mfaSetup.complete.badge': 'Authentification à deux facteurs activée',
  'mfaSetup.recovery.title': 'Codes de récupération',
  'mfaSetup.recovery.description':
    'Conservez ces codes dans votre gestionnaire de mots de passe. Chacun peut être utilisé une seule fois si vous perdez l’accès à votre authentificateur.',
  'mfaSetup.complete.done': 'Terminer',
  'mfaSetup.securitySettings': 'Paramètres de sécurité',
  'mfaSetup.enabled.title': 'Authentification à deux facteurs',
  'mfaSetup.enabled.description': 'Votre compte est protégé par une application d’authentification.',
  'mfaSetup.enabled.badge': 'L’authentification à deux facteurs est activée',
  'mfaSetup.enabled.disable': 'Désactiver dans les paramètres de sécurité',
  'mfaSetup.reauth.title': 'Confirmez votre mot de passe',
  'mfaSetup.reauth.description':
    'Pour votre sécurité, confirmez votre mot de passe avant de configurer l’authentification à deux facteurs.',
  'mfaSetup.reauth.password': 'Mot de passe',
  'mfaSetup.reauth.confirming': 'Confirmation…',
  'mfaSetup.reauth.continue': 'Continuer',
  'mfaSetup.setup.title': 'Configurer l’authentification à deux facteurs',
  'mfaSetup.setup.description':
    'Scannez le code QR avec une application d’authentification (Google Authenticator, 1Password ou Authy), puis saisissez le code à 6 chiffres.',
  'mfaSetup.setup.qrAria': 'Code QR de configuration de l’authentificateur',
  'mfaSetup.setup.cannotScan': 'Impossible de le scanner ?',
  'mfaSetup.setup.manual':
    'Saisissez manuellement cette clé de configuration dans votre application d’authentification.',
  'mfaSetup.setup.code': 'Code à 6 chiffres',
  'mfaSetup.setup.enabling': 'Activation…',
  'mfaSetup.setup.enable': 'Activer l’authentification à deux facteurs',
};

export function getMfaSetupCopy(language?: string | null): MfaSetupCopy {
  return resolveMarketingLanguage(language) === 'fr' ? mfaSetupFr : mfaSetupEn;
}

export function resolveMfaSetupLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}
