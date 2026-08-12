import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const importHubEn = {
  'importHub.meta.title': 'Import a project - E-Code',
  'importHub.page.title': 'Import a project',
  'importHub.page.description':
    'Bring your existing code, data, or design into a persistent E-Code workspace. Files are staged and scanned for secrets before anything is committed.',
  'importHub.category.git': 'Git repositories',
  'importHub.category.export': 'Agent and builder exports',
  'importHub.category.data': 'Data',
  'importHub.category.design': 'Design',
  'importHub.category.ai': 'AI',
  'importHub.category.blank': 'Start fresh',
  'importHub.provider.github.label': 'GitHub',
  'importHub.provider.github.description':
    'Import a public repository by URL, including a quick express import from a pasted URL.',
  'importHub.provider.bitbucket.label': 'Bitbucket',
  'importHub.provider.bitbucket.description': 'Import a Bitbucket repository by URL into a persistent project.',
  'importHub.provider.zip.label': 'ZIP archive',
  'importHub.provider.zip.description': 'Upload a .zip of your code and turn it into a persistent workspace.',
  'importHub.provider.spreadsheet.label': 'Spreadsheet',
  'importHub.provider.spreadsheet.description': 'Paste or upload CSV/TSV and generate a real, sortable data app.',
  'importHub.provider.bolt.label': 'Bolt',
  'importHub.provider.bolt.description':
    'Import a Bolt export archive. Files are staged and scanned for secrets before commit.',
  'importHub.provider.lovable.label': 'Lovable',
  'importHub.provider.lovable.description':
    'Import a Lovable export archive with secret detection and a preview before it lands.',
  'importHub.provider.base44.label': 'Base44',
  'importHub.provider.base44.description': 'Import a Base44 export archive into an isolated, persistent project.',
  'importHub.provider.previous-agent-export.label': 'Previous Agent export',
  'importHub.provider.previous-agent-export.description':
    'Bring an export from another AI builder and continue it in the E-Code IDE.',
  'importHub.provider.empty.label': 'Empty project',
  'importHub.provider.empty.description':
    'Start from a blank workspace with no agent, framework, or scaffolding. Built for power users.',
  'importHub.provider.vercel.label': 'Vercel',
  'importHub.provider.vercel.description': 'Import a Vercel project. Requires connecting a Vercel access token.',
  'importHub.provider.vercel.badge': 'Connect token',
  'importHub.provider.figma.label': 'Figma',
  'importHub.provider.figma.description': 'Import a Figma design. Requires a Figma personal access token.',
  'importHub.provider.figma.badge': 'Connect token',
  'importHub.provider.claude.label': 'Claude',
  'importHub.provider.claude.description': 'Import a Claude design or artifact source. Requires connecting the source.',
  'importHub.provider.claude.badge': 'Connect source',
  'importHub.action.connect': 'Connect',
  'importHub.error.title': 'Import sources are unavailable',
  'importHub.error.description':
    'E-Code could not load your organization. Your imports and credentials were not changed. Try again.',
  'importHub.error.retry': 'Try again',
  'importHub.credential.metaTitle': 'Import from {{label}} - E-Code',
  'importHub.credential.metaFallback': 'Import - E-Code',
  'importHub.credential.title': 'Import from {{label}}',
  'importHub.credential.description': 'Connect {{label}} to import into a persistent workspace.',
  'importHub.credential.explanation':
    'Importing from {{label}} requires {{requirement}}. This connector remains disabled until the credential is connected, and it never reports a success it did not perform.',
  'importHub.credential.status': 'Credentials required — connect {{label}} to enable this import.',
  'importHub.credential.back': 'Back to all import sources',
  'importHub.credential.requirement.vercel': 'a Vercel access token with read access to the project you want to import',
  'importHub.credential.requirement.figma':
    'a Figma personal access token and the file key of the design you want to import',
  'importHub.credential.requirement.claude': 'a connected Claude source for the design or artifact you want to import',

  /*
   * TPL-02.3 — per-connector preview. Shown BEFORE anything is written to a
   * project: what would land, what the secret scan found, and the per-finding
   * decision the commit gate requires. The wording never promises an import
   * happened; staging is disposable until the explicit commit.
   */
  'importHub.preview.metaTitle': 'Review import - E-Code',
  'importHub.preview.title': 'Review before importing',
  'importHub.preview.description':
    'Nothing has been written yet. These files are staged in a disposable area; review them and confirm to create the project.',
  'importHub.preview.source': 'Source',
  'importHub.preview.sourceRef': 'From {{ref}}',
  'importHub.preview.filesHeading': 'Files that would be imported ({{count}})',
  'importHub.preview.filesEmpty': 'This import stages no file.',
  'importHub.preview.fileSize': '{{bytes}} bytes',
  'importHub.preview.scanHeading': 'Secret scan',
  'importHub.preview.scanClean': 'No secret-shaped content was found. You can create the project.',
  'importHub.preview.scanFound':
    '{{count}} finding(s) need a decision. The import cannot be committed while any finding is undecided.',
  'importHub.preview.findingLocation': '{{path}}, line {{line}}',
  'importHub.preview.findingKind.env-secret': 'Environment secret',
  'importHub.preview.findingKind.private-key': 'Private key',
  'importHub.preview.findingKind.provider-token': 'Provider token',
  'importHub.preview.findingKind.high-entropy': 'High-entropy value',
  'importHub.preview.decision.redact': 'Redact this line',
  'importHub.preview.decision.keep': 'Keep it as-is',
  'importHub.preview.decisionRequired': 'Choose for every finding to continue.',
  'importHub.preview.submit': 'Create the project',
  'importHub.preview.submitting': 'Creating…',
  'importHub.preview.cancel': 'Cancel this import',
  'importHub.preview.error.unresolved': 'Every finding needs an explicit decision before the import can be committed.',
  'importHub.preview.error.stagingGone':
    'This staged import has expired or was already committed. Nothing was written; start the import again.',
  'importHub.preview.error.commitFailed': 'The import could not be committed. Nothing was written; you can retry.',
  'importHub.preview.redactedNote': 'Redaction rewrites the staged copy only — your source is never modified.',

  /*
   * Credential-gated connectors get the SAME preview contract described up
   * front, without inventing a file list they cannot know before a token
   * exists. Honesty over completeness.
   */
  'importHub.credential.previewHeading': 'What the preview will show once connected',
  'importHub.credential.previewStep1': 'The exact files {{label}} would stage, with their sizes.',
  'importHub.credential.previewStep2': 'Every secret-shaped finding, previewed redacted — never the raw value.',
  'importHub.credential.previewStep3': 'A per-finding redact-or-keep decision, required before anything is written.',
  'importHub.credential.previewNote':
    'No file is staged and no project is created until {{label}} is connected. This page performs no import.',
} as const;

export type ImportHubKey = keyof typeof importHubEn;
export type ImportHubCopy = Readonly<Record<ImportHubKey, string>>;

export const importHubFr: ImportHubCopy = {
  'importHub.meta.title': 'Importer un projet - E-Code',
  'importHub.page.title': 'Importer un projet',
  'importHub.page.description':
    'Importez votre code, vos données ou votre design dans un espace de travail E-Code persistant. Les fichiers sont préparés et analysés pour détecter les secrets avant tout commit.',
  'importHub.category.git': 'Dépôts Git',
  'importHub.category.export': 'Exports d’agents et d’outils de création',
  'importHub.category.data': 'Données',
  'importHub.category.design': 'Design',
  'importHub.category.ai': 'IA',
  'importHub.category.blank': 'Partir de zéro',
  'importHub.provider.github.label': 'GitHub',
  'importHub.provider.github.description':
    'Importez un dépôt public par URL, avec import express depuis une URL collée.',
  'importHub.provider.bitbucket.label': 'Bitbucket',
  'importHub.provider.bitbucket.description': 'Importez un dépôt Bitbucket par URL dans un projet persistant.',
  'importHub.provider.zip.label': 'Archive ZIP',
  'importHub.provider.zip.description':
    'Téléversez une archive .zip de votre code et convertissez-la en espace de travail persistant.',
  'importHub.provider.spreadsheet.label': 'Feuille de calcul',
  'importHub.provider.spreadsheet.description':
    'Collez ou téléversez un fichier CSV/TSV et générez une véritable application de données avec tri.',
  'importHub.provider.bolt.label': 'Bolt',
  'importHub.provider.bolt.description':
    'Importez une archive exportée depuis Bolt. Les fichiers sont préparés et analysés pour détecter les secrets avant le commit.',
  'importHub.provider.lovable.label': 'Lovable',
  'importHub.provider.lovable.description':
    'Importez une archive exportée depuis Lovable, avec détection des secrets et aperçu avant intégration.',
  'importHub.provider.base44.label': 'Base44',
  'importHub.provider.base44.description':
    'Importez une archive exportée depuis Base44 dans un projet isolé et persistant.',
  'importHub.provider.previous-agent-export.label': 'Export d’un Agent précédent',
  'importHub.provider.previous-agent-export.description':
    'Récupérez un export provenant d’un autre outil de création par IA et poursuivez son développement dans l’IDE E-Code.',
  'importHub.provider.empty.label': 'Projet vide',
  'importHub.provider.empty.description':
    'Partez d’un espace de travail vierge, sans agent, framework ni scaffolding. Conçu pour les utilisateurs avancés.',
  'importHub.provider.vercel.label': 'Vercel',
  'importHub.provider.vercel.description':
    'Importez un projet Vercel. La connexion d’un jeton d’accès Vercel est requise.',
  'importHub.provider.vercel.badge': 'Connecter le jeton',
  'importHub.provider.figma.label': 'Figma',
  'importHub.provider.figma.description': 'Importez un design Figma. Un jeton d’accès personnel Figma est requis.',
  'importHub.provider.figma.badge': 'Connecter le jeton',
  'importHub.provider.claude.label': 'Claude',
  'importHub.provider.claude.description':
    'Importez une source de design ou d’artifact Claude. La connexion de la source est requise.',
  'importHub.provider.claude.badge': 'Connecter la source',
  'importHub.action.connect': 'Connecter',
  'importHub.error.title': 'Sources d’import indisponibles',
  'importHub.error.description':
    'E-Code n’a pas pu charger votre organisation. Vos imports et vos identifiants n’ont pas été modifiés. Réessayez.',
  'importHub.error.retry': 'Réessayer',
  'importHub.credential.metaTitle': 'Importer depuis {{label}} - E-Code',
  'importHub.credential.metaFallback': 'Import - E-Code',
  'importHub.credential.title': 'Importer depuis {{label}}',
  'importHub.credential.description': 'Connectez {{label}} pour importer dans un espace de travail persistant.',
  'importHub.credential.explanation':
    'L’import depuis {{label}} nécessite {{requirement}}. Ce connecteur reste désactivé tant que l’identifiant n’est pas connecté et ne signale jamais une réussite qui n’a pas eu lieu.',
  'importHub.credential.status': 'Identifiants requis — connectez {{label}} pour activer cet import.',
  'importHub.credential.back': 'Revenir à toutes les sources d’import',
  'importHub.credential.requirement.vercel':
    'un jeton d’accès Vercel autorisé à lire le projet que vous souhaitez importer',
  'importHub.credential.requirement.figma':
    'un jeton d’accès personnel Figma et la clé du fichier de design à importer',
  'importHub.credential.requirement.claude':
    'une source Claude connectée pour le design ou l’artifact que vous souhaitez importer',

  'importHub.preview.metaTitle': 'Vérifier l’import - E-Code',
  'importHub.preview.title': 'Vérifier avant d’importer',
  'importHub.preview.description':
    'Rien n’a encore été écrit. Ces fichiers sont préparés dans un espace jetable ; vérifiez-les puis confirmez pour créer le projet.',
  'importHub.preview.source': 'Source',
  'importHub.preview.sourceRef': 'Depuis {{ref}}',
  'importHub.preview.filesHeading': 'Fichiers qui seraient importés ({{count}})',
  'importHub.preview.filesEmpty': 'Cet import ne prépare aucun fichier.',
  'importHub.preview.fileSize': '{{bytes}} octets',
  'importHub.preview.scanHeading': 'Analyse des secrets',
  'importHub.preview.scanClean': 'Aucun contenu de forme secrète détecté. Vous pouvez créer le projet.',
  'importHub.preview.scanFound':
    '{{count}} détection(s) attendent une décision. L’import ne peut pas être validé tant qu’une détection reste sans décision.',
  'importHub.preview.findingLocation': '{{path}}, ligne {{line}}',
  'importHub.preview.findingKind.env-secret': 'Secret d’environnement',
  'importHub.preview.findingKind.private-key': 'Clé privée',
  'importHub.preview.findingKind.provider-token': 'Jeton de fournisseur',
  'importHub.preview.findingKind.high-entropy': 'Valeur à forte entropie',
  'importHub.preview.decision.redact': 'Masquer cette ligne',
  'importHub.preview.decision.keep': 'La conserver telle quelle',
  'importHub.preview.decisionRequired': 'Choisissez pour chaque détection afin de continuer.',
  'importHub.preview.submit': 'Créer le projet',
  'importHub.preview.submitting': 'Création…',
  'importHub.preview.cancel': 'Annuler cet import',
  'importHub.preview.error.unresolved':
    'Chaque détection doit recevoir une décision explicite avant que l’import puisse être validé.',
  'importHub.preview.error.stagingGone':
    'Cet import préparé a expiré ou a déjà été validé. Rien n’a été écrit ; relancez l’import.',
  'importHub.preview.error.commitFailed':
    'L’import n’a pas pu être validé. Rien n’a été écrit ; vous pouvez réessayer.',
  'importHub.preview.redactedNote':
    'Le masquage ne réécrit que la copie préparée — votre source n’est jamais modifiée.',

  'importHub.credential.previewHeading': 'Ce que l’aperçu affichera une fois la source connectée',
  'importHub.credential.previewStep1': 'Les fichiers exacts que {{label}} préparerait, avec leur taille.',
  'importHub.credential.previewStep2':
    'Chaque détection de forme secrète, prévisualisée masquée — jamais la valeur brute.',
  'importHub.credential.previewStep3': 'Une décision masquer-ou-conserver par détection, exigée avant toute écriture.',
  'importHub.credential.previewNote':
    'Aucun fichier n’est préparé et aucun projet n’est créé tant que {{label}} n’est pas connecté. Cette page n’effectue aucun import.',
};

export type ImportHubCredentialProviderId = 'vercel' | 'figma' | 'claude';

export function getImportHubCopy(language?: string | null): ImportHubCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? importHubFr : importHubEn;
}

export function formatImportHubCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function getImportHubCredentialRequirement(
  provider: ImportHubCredentialProviderId,
  language?: string | null,
): string {
  return getImportHubCopy(language)[`importHub.credential.requirement.${provider}`];
}
