import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export const supportEn = {
  'support.metaTitle': 'Support - E-Code',
  'support.metaDescription': 'Open and track E-Code support requests for your organization.',
  'support.title': 'Support',
  'support.description': 'Open support tickets and review enterprise support status.',
  'support.load.loading': 'Loading support tickets',
  'support.load.errorTitle': 'Support tickets could not load',
  'support.load.errorDescription':
    'Your ticket history is hidden because the latest request failed. No ticket was changed.',
  'support.load.retry': 'Reload support tickets',
  'support.error.organizationUnavailable': 'Your organization is unavailable. Reload the page and try again.',
  'support.error.subjectRequired': 'Enter a subject for your support request.',
  'support.error.invalidCategory': 'Select a valid support category.',
  'support.error.forbidden': 'You cannot create support tickets for this organization.',
  'support.error.rateLimited': 'Too many support requests were sent. Wait a moment, then try again.',
  'support.error.rejected': 'We could not open your support ticket. Check the form and try again.',
  'support.error.unavailable': 'Support is temporarily unavailable. Try again later.',
  'support.open.title': 'Your open tickets',
  'support.open.emptyTitle': 'No open tickets',
  'support.open.emptyDescription': 'Open a ticket for runtime, billing or security support.',
  'support.past.title': 'Resolved and closed',
  'support.ticket.openedPrefix': 'Opened',
  'support.ticket.recorded': 'Recorded',
  'support.ticket.status.open': 'Open',
  'support.ticket.status.pending': 'Pending',
  'support.ticket.status.resolved': 'Resolved',
  'support.ticket.status.closed': 'Closed',
  'support.ticket.status.unavailable': 'Status unavailable',
  'support.form.subject': 'Subject',
  'support.form.subjectPlaceholder': 'Briefly describe what you need help with',
  'support.form.category': 'Category',
  'support.form.securityNotice': "Your request is logged securely and included in your organization's audit history.",
  'support.form.submitting': 'Opening ticket…',
  'support.form.submit': 'Open ticket',
  'support.category.runtime': 'Runtime and workspaces',
  'support.category.billing': 'Billing and plans',
  'support.category.security': 'Security',
  'support.category.account': 'Account and access',
  'support.category.other': 'Something else',
  'support.response.title': 'Response times',
  'support.response.description': 'Target first response by plan. Targets, not contractual guarantees.',
  'support.response.currentPlan': 'Your plan',
  'support.response.plan.starter': 'Starter',
  'support.response.plan.core': 'Core',
  'support.response.plan.pro': 'Pro',
  'support.response.plan.enterprise': 'Enterprise',
  'support.response.businessDay_one': '{count} business day',
  'support.response.businessDay_other': '{count} business days',
  'support.response.businessHour_one': '{count} business hour',
  'support.response.businessHour_other': '{count} business hours',
} as const;

export type SupportKey = keyof typeof supportEn;
export type SupportCopy = Readonly<Record<SupportKey, string>>;
export type SupportLanguage = MarketingLanguage;
export type SupportCategory = 'runtime' | 'billing' | 'security' | 'account' | 'other';
export type SupportResponseUnit = 'businessDay' | 'businessHour';
export type SupportActionErrorCode =
  | 'organizationUnavailable'
  | 'subjectRequired'
  | 'invalidCategory'
  | 'forbidden'
  | 'rateLimited'
  | 'rejected'
  | 'unavailable';

export const supportFr: SupportCopy = {
  'support.metaTitle': 'Assistance - E-Code',
  'support.metaDescription': 'Ouvrez et suivez les demandes d’assistance E-Code de votre organisation.',
  'support.title': 'Assistance',
  'support.description': 'Ouvrez des demandes et consultez le niveau d’assistance de votre organisation.',
  'support.load.loading': 'Chargement des demandes d’assistance',
  'support.load.errorTitle': 'Impossible de charger les demandes d’assistance',
  'support.load.errorDescription':
    'L’historique de vos demandes est masqué, car la dernière requête a échoué. Aucune demande n’a été modifiée.',
  'support.load.retry': 'Recharger les demandes',
  'support.error.organizationUnavailable': 'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'support.error.subjectRequired': 'Saisissez l’objet de votre demande d’assistance.',
  'support.error.invalidCategory': 'Sélectionnez une catégorie d’assistance valide.',
  'support.error.forbidden': 'Vous ne pouvez pas créer de demande d’assistance pour cette organisation.',
  'support.error.rateLimited': 'Trop de demandes d’assistance ont été envoyées. Patientez un instant, puis réessayez.',
  'support.error.rejected': 'Impossible d’ouvrir votre demande. Vérifiez le formulaire, puis réessayez.',
  'support.error.unavailable': 'L’assistance est temporairement indisponible. Réessayez plus tard.',
  'support.open.title': 'Vos demandes en cours',
  'support.open.emptyTitle': 'Aucune demande en cours',
  'support.open.emptyDescription':
    'Ouvrez une demande pour obtenir de l’aide sur l’environnement d’exécution, la facturation ou la sécurité.',
  'support.past.title': 'Demandes résolues et fermées',
  'support.ticket.openedPrefix': 'Ouverte',
  'support.ticket.recorded': 'Enregistrée',
  'support.ticket.status.open': 'Ouverte',
  'support.ticket.status.pending': 'En attente',
  'support.ticket.status.resolved': 'Résolue',
  'support.ticket.status.closed': 'Fermée',
  'support.ticket.status.unavailable': 'État indisponible',
  'support.form.subject': 'Objet',
  'support.form.subjectPlaceholder': 'Décrivez brièvement le problème rencontré',
  'support.form.category': 'Catégorie',
  'support.form.securityNotice':
    'Votre demande est journalisée de manière sécurisée et ajoutée à l’historique d’audit de votre organisation.',
  'support.form.submitting': 'Ouverture de la demande…',
  'support.form.submit': 'Ouvrir une demande',
  'support.category.runtime': 'Environnement d’exécution et espaces de travail',
  'support.category.billing': 'Facturation et forfaits',
  'support.category.security': 'Sécurité',
  'support.category.account': 'Compte et accès',
  'support.category.other': 'Autre demande',
  'support.response.title': 'Délais de réponse',
  'support.response.description':
    'Objectif de première réponse selon le forfait. Ces délais sont indicatifs et non contractuels.',
  'support.response.currentPlan': 'Votre forfait',
  'support.response.plan.starter': 'Starter',
  'support.response.plan.core': 'Core',
  'support.response.plan.pro': 'Pro',
  'support.response.plan.enterprise': 'Enterprise',
  'support.response.businessDay_one': '{count} jour ouvré',
  'support.response.businessDay_other': '{count} jours ouvrés',
  'support.response.businessHour_one': '{count} heure ouvrée',
  'support.response.businessHour_other': '{count} heures ouvrées',
};

const categoryKeys = {
  runtime: 'support.category.runtime',
  billing: 'support.category.billing',
  security: 'support.category.security',
  account: 'support.category.account',
  other: 'support.category.other',
} as const satisfies Record<SupportCategory, SupportKey>;

const statusKeys: Readonly<Record<string, SupportKey>> = {
  OPEN: 'support.ticket.status.open',
  PENDING: 'support.ticket.status.pending',
  RESOLVED: 'support.ticket.status.resolved',
  CLOSED: 'support.ticket.status.closed',
};

const actionErrorKeys = {
  organizationUnavailable: 'support.error.organizationUnavailable',
  subjectRequired: 'support.error.subjectRequired',
  invalidCategory: 'support.error.invalidCategory',
  forbidden: 'support.error.forbidden',
  rateLimited: 'support.error.rateLimited',
  rejected: 'support.error.rejected',
  unavailable: 'support.error.unavailable',
} as const satisfies Record<SupportActionErrorCode, SupportKey>;

export function resolveSupportLanguage(language?: string | null): SupportLanguage {
  return resolveMarketingLanguage(language);
}

export function getSupportCopy(language?: string | null): SupportCopy {
  return resolveSupportLanguage(language) === 'fr' ? supportFr : supportEn;
}

export function formatSupportCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function supportCategoryLabel(category: SupportCategory, language?: string | null): string {
  const copy = getSupportCopy(language);

  return copy[categoryKeys[category]];
}

export function supportTicketStatusLabel(status: string | undefined, language?: string | null): string {
  const copy = getSupportCopy(language);
  const key = status ? statusKeys[status.trim().toUpperCase()] : undefined;

  return copy[key ?? 'support.ticket.status.unavailable'];
}

export function supportActionErrorMessage(
  code: SupportActionErrorCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getSupportCopy(language)[actionErrorKeys[code]] : undefined;
}

export function formatSupportResponseTarget(
  value: number,
  unit: SupportResponseUnit,
  language?: string | null,
): string {
  const resolvedLanguage = resolveSupportLanguage(language);
  const copy = getSupportCopy(resolvedLanguage);
  const plural = value === 1 ? 'one' : 'other';
  const key = `support.response.${unit}_${plural}` as SupportKey;

  return formatSupportCopy(copy[key], {
    count: formatUserAreaNumber(value, undefined, resolvedLanguage),
  });
}
