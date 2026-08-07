import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const connectionsTabEn = {
  'connectionsTab.providers.title': 'Provider Keys',
  'connectionsTab.providers.loading': 'Checking configured providers…',
  'connectionsTab.providers.unavailable': 'Provider status unavailable',
  'connectionsTab.providers.summary.one': '{configured}/{total} provider configured',
  'connectionsTab.providers.summary.other': '{configured}/{total} providers configured',
  'connectionsTab.providers.open': 'Open providers',
  'connectionsTab.providers.errorTitle': 'Provider keys could not be loaded',
  'connectionsTab.providers.errorDescription':
    'Configured providers are temporarily unavailable. Check your connection and try again.',
  'connectionsTab.providers.retry': 'Try again',
  'connectionsTab.providers.emptyTitle': 'No providers available',
  'connectionsTab.providers.emptyDescription': 'No configurable providers were returned for this workspace.',
  'connectionsTab.provider.set': 'Set',
  'connectionsTab.provider.notSet': 'Not set',
  'connectionsTab.provider.status': '{provider}: {status}',
  'connectionsTab.services.title': 'Services and integrations',
  'connectionsTab.services.openAria': 'Open {service} settings',
  'connectionsTab.service.github': 'GitHub',
  'connectionsTab.service.gitlab': 'GitLab',
  'connectionsTab.service.netlify': 'Netlify',
  'connectionsTab.service.vercel': 'Vercel',
  'connectionsTab.service.supabase': 'Supabase',
  'connectionsTab.service.cloudProviders': 'Cloud Providers',
  'connectionsTab.service.localProviders': 'Local Providers',
  'connectionsTab.service.mcpServers': 'MCP Servers',
  'connectionsTab.request.title': 'Request an integration',
  'connectionsTab.request.description':
    "Need a connector or service that isn't available yet? Tell us what you'd build with it.",
  'connectionsTab.request.nameLabel': 'Integration name',
  'connectionsTab.request.namePlaceholder': 'e.g. Notion, Stripe, or Twilio',
  'connectionsTab.request.useCaseLabel': 'What would you use it for?',
  'connectionsTab.request.useCasePlaceholder': 'Describe the use case so we can prioritize it.',
  'connectionsTab.request.visibility': 'Your request is visible to you and your organization.',
  'connectionsTab.request.submit': 'Submit request',
  'connectionsTab.request.submitting': 'Submitting…',
  'connectionsTab.request.submitSuccess': 'Thanks! Your request has been recorded.',
  'connectionsTab.request.submitError':
    'Your integration request could not be submitted. Check your connection and try again.',
  'connectionsTab.request.heading.one': 'Your request ({count})',
  'connectionsTab.request.heading.other': 'Your requests ({count})',
  'connectionsTab.request.loading': 'Loading your requests…',
  'connectionsTab.request.loadErrorTitle': 'Integration requests could not be loaded',
  'connectionsTab.request.loadErrorDescription':
    'Your integration requests are temporarily unavailable. Check your connection and try again.',
  'connectionsTab.request.retry': 'Try again',
  'connectionsTab.request.empty': "You haven't requested any integrations yet.",
  'connectionsTab.request.team': 'team',
  'connectionsTab.request.status.pending': 'Pending',
  'connectionsTab.request.status.planned': 'Planned',
  'connectionsTab.request.status.inProgress': 'In progress',
  'connectionsTab.request.status.shipped': 'Shipped',
  'connectionsTab.request.status.completed': 'Completed',
  'connectionsTab.request.status.declined': 'Declined',
  'connectionsTab.request.status.rejected': 'Rejected',
  'connectionsTab.request.status.unknown': 'Unknown status',
} as const;

export type ConnectionsTabKey = keyof typeof connectionsTabEn;
export type ConnectionsTabCopy = Readonly<Record<ConnectionsTabKey, string>>;
export type ConnectionsTabPluralCopy = Readonly<{ one: string; other: string }>;

export const connectionsTabFr: ConnectionsTabCopy = {
  'connectionsTab.providers.title': 'Clés des fournisseurs',
  'connectionsTab.providers.loading': 'Vérification des fournisseurs configurés…',
  'connectionsTab.providers.unavailable': 'État des fournisseurs indisponible',
  'connectionsTab.providers.summary.one': '{configured}/{total} fournisseur configuré',
  'connectionsTab.providers.summary.other': '{configured}/{total} fournisseurs configurés',
  'connectionsTab.providers.open': 'Ouvrir les fournisseurs',
  'connectionsTab.providers.errorTitle': 'Impossible de charger les clés des fournisseurs',
  'connectionsTab.providers.errorDescription':
    'Les fournisseurs configurés sont temporairement indisponibles. Vérifiez votre connexion, puis réessayez.',
  'connectionsTab.providers.retry': 'Réessayer',
  'connectionsTab.providers.emptyTitle': 'Aucun fournisseur disponible',
  'connectionsTab.providers.emptyDescription':
    'Aucun fournisseur configurable n’a été renvoyé pour cet espace de travail.',
  'connectionsTab.provider.set': 'Configuré',
  'connectionsTab.provider.notSet': 'Non configuré',
  'connectionsTab.provider.status': '{provider} : {status}',
  'connectionsTab.services.title': 'Services et intégrations',
  'connectionsTab.services.openAria': 'Ouvrir les paramètres de {service}',
  'connectionsTab.service.github': 'GitHub',
  'connectionsTab.service.gitlab': 'GitLab',
  'connectionsTab.service.netlify': 'Netlify',
  'connectionsTab.service.vercel': 'Vercel',
  'connectionsTab.service.supabase': 'Supabase',
  'connectionsTab.service.cloudProviders': 'Fournisseurs cloud',
  'connectionsTab.service.localProviders': 'Fournisseurs locaux',
  'connectionsTab.service.mcpServers': 'Serveurs MCP',
  'connectionsTab.request.title': 'Demander une intégration',
  'connectionsTab.request.description':
    'Vous avez besoin d’un connecteur ou d’un service qui n’est pas encore disponible ? Indiquez-nous ce que vous souhaitez créer avec.',
  'connectionsTab.request.nameLabel': 'Nom de l’intégration',
  'connectionsTab.request.namePlaceholder': 'p. ex. Notion, Stripe ou Twilio',
  'connectionsTab.request.useCaseLabel': 'À quoi vous servirait-elle ?',
  'connectionsTab.request.useCasePlaceholder': 'Décrivez votre cas d’usage pour nous aider à établir les priorités.',
  'connectionsTab.request.visibility': 'Votre demande est visible par vous-même et les membres de votre organisation.',
  'connectionsTab.request.submit': 'Envoyer la demande',
  'connectionsTab.request.submitting': 'Envoi…',
  'connectionsTab.request.submitSuccess': 'Merci ! Votre demande a bien été enregistrée.',
  'connectionsTab.request.submitError':
    'Impossible d’envoyer votre demande d’intégration. Vérifiez votre connexion, puis réessayez.',
  'connectionsTab.request.heading.one': 'Votre demande ({count})',
  'connectionsTab.request.heading.other': 'Vos demandes ({count})',
  'connectionsTab.request.loading': 'Chargement de vos demandes…',
  'connectionsTab.request.loadErrorTitle': 'Impossible de charger les demandes d’intégration',
  'connectionsTab.request.loadErrorDescription':
    'Vos demandes d’intégration sont temporairement indisponibles. Vérifiez votre connexion, puis réessayez.',
  'connectionsTab.request.retry': 'Réessayer',
  'connectionsTab.request.empty': 'Vous n’avez encore demandé aucune intégration.',
  'connectionsTab.request.team': 'équipe',
  'connectionsTab.request.status.pending': 'En attente',
  'connectionsTab.request.status.planned': 'Planifiée',
  'connectionsTab.request.status.inProgress': 'En cours',
  'connectionsTab.request.status.shipped': 'Livrée',
  'connectionsTab.request.status.completed': 'Terminée',
  'connectionsTab.request.status.declined': 'Refusée',
  'connectionsTab.request.status.rejected': 'Rejetée',
  'connectionsTab.request.status.unknown': 'État inconnu',
};

type ConnectionsTabInterpolationValue = string | number | bigint;

export function getConnectionsTabCopy(language?: string | null): ConnectionsTabCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? connectionsTabFr : connectionsTabEn;
}

export function interpolateConnectionsTabCopy(
  template: string,
  values: Readonly<Record<string, ConnectionsTabInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatConnectionsTabNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatConnectionsTabProviderSummary(
  configured: number,
  total: number,
  language?: string | null,
): string {
  const copy = getConnectionsTabCopy(language);
  const suffix = total === 1 ? 'one' : 'other';

  return interpolateConnectionsTabCopy(copy[`connectionsTab.providers.summary.${suffix}`], {
    configured: formatConnectionsTabNumber(configured, language),
    total: formatConnectionsTabNumber(total, language),
  });
}

export function formatConnectionsTabRequestHeading(count: number, language?: string | null): string {
  const copy = getConnectionsTabCopy(language);
  const suffix = count === 1 ? 'one' : 'other';

  return interpolateConnectionsTabCopy(copy[`connectionsTab.request.heading.${suffix}`], {
    count: formatConnectionsTabNumber(count, language),
  });
}

export function formatConnectionsTabRequestDate(value: string | number | Date, language?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(date);
}

const integrationRequestStatusKeys = {
  pending: 'connectionsTab.request.status.pending',
  planned: 'connectionsTab.request.status.planned',
  in_progress: 'connectionsTab.request.status.inProgress',
  shipped: 'connectionsTab.request.status.shipped',
  completed: 'connectionsTab.request.status.completed',
  declined: 'connectionsTab.request.status.declined',
  rejected: 'connectionsTab.request.status.rejected',
} as const satisfies Readonly<Record<string, ConnectionsTabKey>>;

export function getConnectionsTabRequestStatusLabel(status: string, language?: string | null): string {
  const normalizedStatus = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, '_');

  const key = integrationRequestStatusKeys[normalizedStatus as keyof typeof integrationRequestStatusKeys];

  return getConnectionsTabCopy(language)[key ?? 'connectionsTab.request.status.unknown'];
}

/** Never expose arbitrary integration-request or network exceptions in settings. */
export function getConnectionsTabRequestSafeError(
  kind: 'load' | 'submit',
  language?: string | null,
  _error?: unknown,
): string {
  const copy = getConnectionsTabCopy(language);

  return kind === 'load'
    ? copy['connectionsTab.request.loadErrorDescription']
    : copy['connectionsTab.request.submitError'];
}

/** Never expose arbitrary provider or network exceptions in settings. */
export function getConnectionsTabSafeError(language?: string | null, _error?: unknown): string {
  return getConnectionsTabCopy(language)['connectionsTab.providers.errorDescription'];
}
