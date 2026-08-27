import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const projectCommandsEn = {
  'projectCommands.scriptFound':
    'Found the “{script}” script in package.json. Running “npm run {script}” after installation.',
  'projectCommands.inspectScripts':
    'Would you like me to inspect package.json to determine the available scripts for running this project?',
  'projectCommands.artifactTitle': 'Project setup',
  'projectCommands.setupPrompt': 'Set up the codebase and start the application',
} as const;

export type ProjectCommandsKey = keyof typeof projectCommandsEn;
export type ProjectCommandsCopy = Readonly<Record<ProjectCommandsKey, string>>;

export const projectCommandsFr: ProjectCommandsCopy = {
  'projectCommands.scriptFound':
    'Le script « {script} » a été trouvé dans package.json. La commande « npm run {script} » sera exécutée après l’installation.',
  'projectCommands.inspectScripts':
    'Souhaitez-vous que j’analyse package.json afin d’identifier les scripts disponibles pour exécuter ce projet ?',
  'projectCommands.artifactTitle': 'Configuration du projet',
  'projectCommands.setupPrompt': 'Configurer la base de code et démarrer l’application',
};

export function getProjectCommandsCopy(language?: string | null): ProjectCommandsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? projectCommandsFr : projectCommandsEn;
}

export function formatProjectCommandsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
