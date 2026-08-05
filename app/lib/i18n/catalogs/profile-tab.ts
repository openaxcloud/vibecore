import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const profileTabEn = {
  'profileTab.toast.usernameUpdated': 'Username updated',
  'profileTab.toast.bioUpdated': 'Bio updated',
  'profileTab.toast.avatarUpdated': 'Profile picture updated',
  'profileTab.toast.avatarTooLarge': 'The image is too large to save. Choose a smaller picture.',
  'profileTab.toast.avatarFailed': 'The profile picture could not be updated.',
  'profileTab.avatar.alt': 'Profile picture',
  'profileTab.avatar.altWithName': 'Profile picture for {name}',
  'profileTab.avatar.inputLabel': 'Choose a profile picture',
  'profileTab.avatar.uploading': 'Uploading profile picture…',
  'profileTab.avatar.title': 'Profile picture',
  'profileTab.avatar.description': 'Upload a profile picture or avatar.',
  'profileTab.username.label': 'Username',
  'profileTab.username.placeholder': 'Enter your username',
  'profileTab.bio.label': 'Bio',
  'profileTab.bio.placeholder': 'Tell us about yourself',
} as const;

export type ProfileTabKey = keyof typeof profileTabEn;
export type ProfileTabCopy = Readonly<Record<ProfileTabKey, string>>;

export const profileTabFr: ProfileTabCopy = {
  'profileTab.toast.usernameUpdated': 'Nom d’utilisateur mis à jour',
  'profileTab.toast.bioUpdated': 'Biographie mise à jour',
  'profileTab.toast.avatarUpdated': 'Photo de profil mise à jour',
  'profileTab.toast.avatarTooLarge':
    'L’image est trop volumineuse pour être enregistrée. Choisissez une image plus petite.',
  'profileTab.toast.avatarFailed': 'Impossible de mettre à jour la photo de profil.',
  'profileTab.avatar.alt': 'Photo de profil',
  'profileTab.avatar.altWithName': 'Photo de profil de {name}',
  'profileTab.avatar.inputLabel': 'Choisir une photo de profil',
  'profileTab.avatar.uploading': 'Importation de la photo de profil…',
  'profileTab.avatar.title': 'Photo de profil',
  'profileTab.avatar.description': 'Importez une photo de profil ou un avatar.',
  'profileTab.username.label': 'Nom d’utilisateur',
  'profileTab.username.placeholder': 'Saisissez votre nom d’utilisateur',
  'profileTab.bio.label': 'Biographie',
  'profileTab.bio.placeholder': 'Présentez-vous en quelques mots',
};

export function getProfileTabCopy(language?: string | null): ProfileTabCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? profileTabFr : profileTabEn;
}

export function formatProfileTabCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
