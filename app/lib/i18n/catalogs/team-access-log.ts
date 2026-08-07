import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime, formatUserAreaNumber, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export type TeamAccessLogLanguage = 'en' | 'fr';

export const teamAccessLogEn = {
  'teamAccessLog.overview.metaTitle': 'Team access log · {team} · E-Code',
  'teamAccessLog.overview.metaDescription':
    'Review and export security-relevant access events for this team in CSV or JSON format.',
  'teamAccessLog.overview.title': 'Team access log',
  'teamAccessLog.overview.description':
    'Review security-relevant access events for this team. Filter by action, or download the complete trail in CSV or JSON format.',
  'teamAccessLog.overview.openSettings': 'Open team settings',
  'teamAccessLog.settings.metaTitle': 'Team settings · {team} · E-Code',
  'teamAccessLog.settings.metaDescription':
    'Manage this team and review its security-relevant access log, exportable in CSV or JSON format.',
  'teamAccessLog.settings.title': 'Team settings',
  'teamAccessLog.settings.description':
    'Manage this team. The access log below records security-relevant events and can be exported in CSV or JSON format.',
  'teamAccessLog.settings.banner': 'Access log for team {team}.',
  'teamAccessLog.settings.openFullLog': 'Open the complete team access log',
  'teamAccessLog.panel.ariaLabel': 'Access log for team {team}',
  'teamAccessLog.permission.title': 'Access restricted',
  'teamAccessLog.permission.description':
    'Some access-log data or export functions are unavailable with your current permissions. Ask a team administrator for access; exports require {permission}.',
  'teamAccessLog.listError.title': 'Team access log unavailable',
  'teamAccessLog.listError.description':
    'The latest access events could not be retrieved. No audit data was changed. Try loading the log again.',
  'teamAccessLog.listError.retry': 'Reload access log',
  'teamAccessLog.loading': 'Loading team access events',
  'teamAccessLog.renderError.title': 'Access log panel unavailable',
  'teamAccessLog.renderError.description':
    'The panel encountered an unexpected display error. Your audit data is unchanged. Reload the panel to try again.',
  'teamAccessLog.renderError.retry': 'Reload panel',
  'teamAccessLog.export.title': 'Export',
  'teamAccessLog.export.description':
    'Download the complete team access log. The file is generated securely on the server using your current session.',
  'teamAccessLog.export.csv': 'Export CSV',
  'teamAccessLog.export.json': 'Export JSON',
  'teamAccessLog.events.title': 'Access events',
  'teamAccessLog.events.count_one': '{count} event',
  'teamAccessLog.events.count_other': '{count} events',
  'teamAccessLog.filter.label': 'Action',
  'teamAccessLog.filter.all': 'All actions',
  'teamAccessLog.empty.title': 'No access events yet',
  'teamAccessLog.empty.description':
    'Security-relevant team activity will appear here as soon as an event is recorded.',
  'teamAccessLog.noMatches.title': 'No matching access events',
  'teamAccessLog.noMatches.description':
    'No event matches the selected action. Choose another action or show all actions.',
  'teamAccessLog.column.time': 'Time',
  'teamAccessLog.column.actor': 'Actor',
  'teamAccessLog.column.action': 'Action',
  'teamAccessLog.column.target': 'Target',
  'teamAccessLog.column.ip': 'IP address',
  'teamAccessLog.team.label': 'Team',
} as const;

export type TeamAccessLogKey = keyof typeof teamAccessLogEn;
export type TeamAccessLogCopy = Readonly<Record<TeamAccessLogKey, string>>;

export const teamAccessLogFr: TeamAccessLogCopy = {
  'teamAccessLog.overview.metaTitle': 'Journal des accès de l’équipe · {team} · E-Code',
  'teamAccessLog.overview.metaDescription':
    'Consultez et exportez les événements d’accès de cette équipe liés à la sécurité aux formats CSV ou JSON.',
  'teamAccessLog.overview.title': 'Journal des accès de l’équipe',
  'teamAccessLog.overview.description':
    'Consultez les événements d’accès de cette équipe liés à la sécurité. Filtrez-les par action ou téléchargez le journal complet aux formats CSV ou JSON.',
  'teamAccessLog.overview.openSettings': 'Ouvrir les paramètres de l’équipe',
  'teamAccessLog.settings.metaTitle': 'Paramètres de l’équipe · {team} · E-Code',
  'teamAccessLog.settings.metaDescription':
    'Gérez cette équipe et consultez son journal des accès liés à la sécurité, exportable aux formats CSV ou JSON.',
  'teamAccessLog.settings.title': 'Paramètres de l’équipe',
  'teamAccessLog.settings.description':
    'Gérez cette équipe. Le journal ci-dessous consigne les événements liés à la sécurité et peut être exporté aux formats CSV ou JSON.',
  'teamAccessLog.settings.banner': 'Journal des accès de l’équipe {team}.',
  'teamAccessLog.settings.openFullLog': 'Ouvrir le journal complet des accès de l’équipe',
  'teamAccessLog.panel.ariaLabel': 'Journal des accès de l’équipe {team}',
  'teamAccessLog.permission.title': 'Accès restreint',
  'teamAccessLog.permission.description':
    'Certaines données du journal ou fonctions d’exportation ne sont pas disponibles avec vos autorisations actuelles. Demandez l’accès à un administrateur de l’équipe ; les exportations nécessitent l’autorisation {permission}.',
  'teamAccessLog.listError.title': 'Journal des accès de l’équipe indisponible',
  'teamAccessLog.listError.description':
    'Impossible de récupérer les événements d’accès les plus récents. Aucune donnée d’audit n’a été modifiée. Rechargez le journal.',
  'teamAccessLog.listError.retry': 'Recharger le journal des accès',
  'teamAccessLog.loading': 'Chargement des événements d’accès de l’équipe',
  'teamAccessLog.renderError.title': 'Panneau du journal des accès indisponible',
  'teamAccessLog.renderError.description':
    'Le panneau a rencontré une erreur d’affichage inattendue. Vos données d’audit sont inchangées. Rechargez le panneau pour réessayer.',
  'teamAccessLog.renderError.retry': 'Recharger le panneau',
  'teamAccessLog.export.title': 'Exportation',
  'teamAccessLog.export.description':
    'Téléchargez le journal complet des accès de l’équipe. Le fichier est généré de façon sécurisée sur le serveur avec votre session actuelle.',
  'teamAccessLog.export.csv': 'Exporter en CSV',
  'teamAccessLog.export.json': 'Exporter en JSON',
  'teamAccessLog.events.title': 'Événements d’accès',
  'teamAccessLog.events.count_one': '{count} événement',
  'teamAccessLog.events.count_other': '{count} événements',
  'teamAccessLog.filter.label': 'Action',
  'teamAccessLog.filter.all': 'Toutes les actions',
  'teamAccessLog.empty.title': 'Aucun événement d’accès pour le moment',
  'teamAccessLog.empty.description':
    'Les activités de l’équipe liées à la sécurité apparaîtront ici dès qu’un événement sera enregistré.',
  'teamAccessLog.noMatches.title': 'Aucun événement d’accès correspondant',
  'teamAccessLog.noMatches.description':
    'Aucun événement ne correspond à l’action sélectionnée. Choisissez une autre action ou affichez-les toutes.',
  'teamAccessLog.column.time': 'Date et heure',
  'teamAccessLog.column.actor': 'Acteur',
  'teamAccessLog.column.action': 'Action',
  'teamAccessLog.column.target': 'Cible',
  'teamAccessLog.column.ip': 'Adresse IP',
  'teamAccessLog.team.label': 'Équipe',
};

export function resolveTeamAccessLogLanguage(language?: string | null): TeamAccessLogLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveTeamAccessLogLanguage(language);
}

function locale(language?: string | null): string {
  return resolveTeamAccessLogLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
}

export function getTeamAccessLogCopy(language?: string | null): TeamAccessLogCopy {
  return resolveTeamAccessLogLanguage(language) === 'fr' ? teamAccessLogFr : teamAccessLogEn;
}

export function formatTeamAccessLogCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatTeamAccessLogCount(count: number, language?: string | null): string {
  const copy = getTeamAccessLogCopy(language);
  const suffix = new Intl.PluralRules(locale(language)).select(count) === 'one' ? 'one' : 'other';

  return formatTeamAccessLogCopy(copy[`teamAccessLog.events.count_${suffix}`], {
    count: formatUserAreaNumber(count, undefined, supportedLanguage(language)),
  });
}

export function formatTeamAccessLogDateTime(value: string | undefined, language?: string | null): string {
  if (!value) {
    return '—';
  }

  return (
    formatUserAreaDateTime(
      value,
      {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: USER_AREA_TIME_ZONE,
      },
      supportedLanguage(language),
    ) ?? value
  );
}
