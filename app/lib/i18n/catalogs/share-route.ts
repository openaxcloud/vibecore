import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const shareRouteEn = {
  'shareRoute.seo.unavailableTitle': 'Share link unavailable · E-Code',
  'shareRoute.seo.defaultTitle': 'E-Code share',
  'shareRoute.seo.titled': '{title} · E-Code share',
  'shareRoute.seo.description': 'View a read-only conversation shared from E-Code.',
  'shareRoute.page.label': 'Shared conversation',
  'shareRoute.page.fallbackTitle': 'Shared conversation',
  'shareRoute.page.loading': 'Loading the shared conversation…',
  'shareRoute.page.loadingDescription': 'Retrieving the read-only snapshot.',
  'shareRoute.meta.fromProject': 'Shared from project',
  'shareRoute.meta.sharedOn': 'Shared on',
  'shareRoute.meta.on': 'on',
  'shareRoute.meta.timeZone': 'UTC',
  'shareRoute.meta.dateUnavailable': 'Date unavailable',
  'shareRoute.messages.heading': 'Shared messages',
  'shareRoute.messages.empty': 'No messages were included in this shared snapshot.',
  'shareRoute.messages.disclaimer.one':
    'This conversation is shown as a read-only snapshot. The shared content contains {count} message.',
  'shareRoute.messages.disclaimer.other':
    'This conversation is shown as a read-only snapshot. The shared content contains {count} messages.',
  'shareRoute.role.user': 'User',
  'shareRoute.role.assistant': 'Assistant',
  'shareRoute.role.system': 'System',
  'shareRoute.fork.disabled': 'Fork this conversation (sign in to enable)',
  'shareRoute.error.badge': 'Share link',
  'shareRoute.error.notFound.heading': 'This share link is no longer available',
  'shareRoute.error.notFound.body':
    'The link may have expired, been revoked by its owner, or never existed. Ask the person who shared it with you for a fresh link.',
  'shareRoute.error.invalid.heading': 'This share link is invalid',
  'shareRoute.error.invalid.body':
    'The link looks malformed or incomplete. It may have been truncated when it was copied. Ask the sender to share it again.',
  'shareRoute.error.projectMissing.heading': 'This project is no longer available',
  'shareRoute.error.projectMissing.body':
    'The share link is valid, but the project behind it has been deleted, so there is nothing left to open.',
  'shareRoute.error.unavailable.heading': 'We could not load this share link',
  'shareRoute.error.unavailable.body':
    'Something went wrong while loading the shared content. Try again in a moment, or ask the sender for a new link.',
  'shareRoute.error.actions.home': 'Back to homepage',
  'shareRoute.error.actions.dashboard': 'Go to dashboard',
  'shareRoute.error.actions.help': 'Visit the help center',
  'shareRoute.error.actions.retry': 'Try again',
  'shareRoute.error.actions.retrying': 'Trying again…',
} as const;

export type ShareRouteKey = keyof typeof shareRouteEn;
export type ShareRouteCopy = Readonly<Record<ShareRouteKey, string>>;

export const shareRouteFr: ShareRouteCopy = {
  'shareRoute.seo.unavailableTitle': 'Lien de partage indisponible · E-Code',
  'shareRoute.seo.defaultTitle': 'Partage E-Code',
  'shareRoute.seo.titled': '{title} · Partage E-Code',
  'shareRoute.seo.description': 'Consultez une conversation E-Code partagée en lecture seule.',
  'shareRoute.page.label': 'Conversation partagée',
  'shareRoute.page.fallbackTitle': 'Conversation partagée',
  'shareRoute.page.loading': 'Chargement de la conversation partagée…',
  'shareRoute.page.loadingDescription': 'Récupération de l’instantané en lecture seule.',
  'shareRoute.meta.fromProject': 'Partagée depuis le projet',
  'shareRoute.meta.sharedOn': 'Partagée le',
  'shareRoute.meta.on': 'le',
  'shareRoute.meta.timeZone': 'UTC',
  'shareRoute.meta.dateUnavailable': 'Date indisponible',
  'shareRoute.messages.heading': 'Messages partagés',
  'shareRoute.messages.empty': 'Aucun message n’a été inclus dans cet instantané partagé.',
  'shareRoute.messages.disclaimer.one':
    'Cette conversation est présentée sous forme d’un instantané en lecture seule. Le contenu partagé comprend {count} message.',
  'shareRoute.messages.disclaimer.other':
    'Cette conversation est présentée sous forme d’un instantané en lecture seule. Le contenu partagé comprend {count} messages.',
  'shareRoute.role.user': 'Utilisateur',
  'shareRoute.role.assistant': 'Assistant',
  'shareRoute.role.system': 'Système',
  'shareRoute.fork.disabled': 'Dupliquer cette conversation (connectez-vous pour l’activer)',
  'shareRoute.error.badge': 'Lien de partage',
  'shareRoute.error.notFound.heading': 'Ce lien de partage n’est plus disponible',
  'shareRoute.error.notFound.body':
    'Le lien a peut-être expiré, été révoqué par son propriétaire ou n’a jamais existé. Demandez un nouveau lien à la personne qui l’a partagé avec vous.',
  'shareRoute.error.invalid.heading': 'Ce lien de partage n’est pas valide',
  'shareRoute.error.invalid.body':
    'Le lien semble incorrect ou incomplet. Il a peut-être été tronqué lors de sa copie. Demandez à son expéditeur de le partager de nouveau.',
  'shareRoute.error.projectMissing.heading': 'Ce projet n’est plus disponible',
  'shareRoute.error.projectMissing.body':
    'Le lien de partage est valide, mais le projet associé a été supprimé. Il n’y a donc plus aucun contenu à ouvrir.',
  'shareRoute.error.unavailable.heading': 'Impossible de charger ce lien de partage',
  'shareRoute.error.unavailable.body':
    'Un problème est survenu pendant le chargement du contenu partagé. Réessayez dans quelques instants ou demandez un nouveau lien à son expéditeur.',
  'shareRoute.error.actions.home': 'Retour à l’accueil',
  'shareRoute.error.actions.dashboard': 'Accéder au tableau de bord',
  'shareRoute.error.actions.help': 'Consulter le centre d’aide',
  'shareRoute.error.actions.retry': 'Réessayer',
  'shareRoute.error.actions.retrying': 'Nouvelle tentative…',
};

export function resolveShareRouteLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getShareRouteCopy(language?: string | null): ShareRouteCopy {
  return resolveShareRouteLanguage(language) === 'fr' ? shareRouteFr : shareRouteEn;
}

export function formatShareRouteCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatShareRouteNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveShareRouteLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatShareRouteDate(value: string | number | Date, language?: string | null): string | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(resolveShareRouteLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatShareRouteMessageCount(count: number, language?: string | null): string {
  const resolvedLanguage = resolveShareRouteLanguage(language);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const plural = new Intl.PluralRules(locale).select(count);
  const suffix = plural === 'one' ? 'one' : 'other';
  const copy = getShareRouteCopy(resolvedLanguage);

  return formatShareRouteCopy(copy[`shareRoute.messages.disclaimer.${suffix}`], {
    count: formatShareRouteNumber(count, resolvedLanguage),
  });
}
