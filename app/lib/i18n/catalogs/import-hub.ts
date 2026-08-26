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
  'importHub.provider.vercel.description':
    'Retrieve and review a real Vercel project configuration before creating a persistent project.',
  'importHub.provider.vercel.badge': 'Connect token',
  'importHub.provider.figma.label': 'Figma',
  'importHub.provider.figma.description':
    'Retrieve and review a real Figma document snapshot before creating a persistent project.',
  'importHub.provider.figma.badge': 'Connect token',
  'importHub.provider.claude.label': 'Claude',
  'importHub.provider.claude.description':
    'Validate Anthropic access, then review and import an explicit Claude artifact export.',
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
  'importHub.credential.connection.title': '1. Connect provider access',
  'importHub.credential.connection.description':
    'The credential is validated by {{label}}, encrypted at rest, and never copied into the imported project.',
  'importHub.credential.connection.connected': 'Connection verified · {{account}}',
  'importHub.credential.connection.reconnect': 'This connection needs to be replaced before importing.',
  'importHub.credential.connection.required': 'Connect {{label}} before selecting a source.',
  'importHub.credential.connection.help': 'Open the {{label}} credential page',
  'importHub.credential.connection.token.vercel': 'Vercel access token',
  'importHub.credential.connection.token.figma': 'Figma personal access token',
  'importHub.credential.connection.token.claude': 'Anthropic API key',
  'importHub.credential.source.title': '2. Select and validate the source',
  'importHub.credential.source.description':
    'E-Code validates the requested source on the server and stages it in isolation. No project is created until you approve the preview.',
  'importHub.credential.source.vercel.label': 'Vercel project ID or name',
  'importHub.credential.source.vercel.placeholder': 'acme-web',
  'importHub.credential.source.vercel.scopeLabel': 'Team ID (optional)',
  'importHub.credential.source.vercel.scopePlaceholder': 'team_…',
  'importHub.credential.source.vercel.scopeHelp':
    'Required only when the project belongs to a Vercel team that cannot be inferred from the token.',
  'importHub.credential.source.figma.label': 'Figma file URL or file key',
  'importHub.credential.source.figma.placeholder': 'https://www.figma.com/design/…',
  'importHub.credential.source.figma.help':
    'Use a token with current_user:read for connection validation and file_content:read for this document.',
  'importHub.credential.source.claude.label': 'Artifact name',
  'importHub.credential.source.claude.placeholder': 'Checkout artifact',
  'importHub.credential.source.claude.payloadLabel': 'Exported artifact source',
  'importHub.credential.source.claude.payloadHelp':
    'Anthropic does not expose Claude chat or artifact history through its API. Paste the source you explicitly exported; E-Code imports it byte for byte.',
  'importHub.credential.source.claude.pathLabel': 'Target file path',
  'importHub.credential.source.claude.pathPlaceholder': 'src/artifact.tsx',
  'importHub.credential.source.preview': 'Validate and preview',
  'importHub.credential.source.previewing': 'Retrieving and validating…',
  'importHub.credential.source.progress': 'Retrieving the provider source',
  'importHub.credential.preview.title': '3. Review before creating',
  'importHub.credential.preview.description':
    'This preview comes from the validated source below. The target project still does not exist.',
  'importHub.credential.preview.files': 'Files to create',
  'importHub.credential.preview.summary': '{{files}} files · {{bytes}}',
  'importHub.credential.preview.fact.framework': 'Framework',
  'importHub.credential.preview.fact.repository': 'Linked repository',
  'importHub.credential.preview.fact.updatedAt': 'Provider update',
  'importHub.credential.preview.fact.pages': 'Pages',
  'importHub.credential.preview.fact.components': 'Components',
  'importHub.credential.preview.fact.componentSets': 'Component sets',
  'importHub.credential.preview.fact.version': 'Version',
  'importHub.credential.preview.fact.sourceFormat': 'Source format',
  'importHub.credential.preview.fact.sourceLines': 'Lines',
  'importHub.credential.preview.fact.sourceCharacters': 'Characters',
  'importHub.credential.preview.fact.verifiedModel': 'Verified API model',
  'importHub.credential.preview.warning.vercelConfigurationOnly':
    'Vercel’s project API exposes configuration and repository references, not source files. This import creates an inspectable configuration snapshot; import the linked Git repository separately to bring in code.',
  'importHub.credential.preview.warning.figmaDocumentSnapshot':
    'The full Figma document JSON is imported as a design snapshot. E-Code does not claim that this is generated application code.',
  'importHub.credential.preview.warning.claudeExactSource':
    'Only the source shown here is imported. E-Code does not generate or infer missing Claude artifact files.',
  'importHub.credential.preview.findings.title': 'Secret review required',
  'importHub.credential.preview.findings.description':
    'The isolated scan detected secret-shaped content. Choose what to do for every finding before creating the project.',
  'importHub.credential.preview.finding': '{{path}}, line {{line}} · {{kind}} · {{preview}}',
  'importHub.credential.preview.keep': 'Keep this value',
  'importHub.credential.preview.redact': 'Redact the value',
  'importHub.credential.preview.create': 'Create the reviewed project',
  'importHub.credential.preview.creating': 'Creating the project…',
  'importHub.credential.preview.progress': 'Creating the reviewed project',
  'importHub.credential.preview.cancel': 'Cancel this staged import',
  'importHub.credential.preview.cancelling': 'Cancelling…',
  'importHub.credential.preview.cancelProgress': 'Cancelling the staged import',
  'importHub.credential.error.load': 'The connection state could not be loaded. No credential or import was changed.',
  'importHub.credential.error.notConnected': 'Connect this provider before validating a source.',
  'importHub.credential.error.credentialExpired': 'This credential has expired. Reconnect the provider and try again.',
  'importHub.credential.error.credentialUnavailable':
    'The encrypted credential cannot be used. Reconnect the provider and try again.',
  'importHub.credential.error.connectorDisabled': 'An administrator has disabled this connector.',
  'importHub.credential.error.sourceRequired': 'Enter every required source field before continuing.',
  'importHub.credential.error.sourceInvalid': 'The source reference or target path is invalid.',
  'importHub.credential.error.sourceNotFound': 'The provider could not find this source.',
  'importHub.credential.error.sourceForbidden': 'This credential does not have permission to read the source.',
  'importHub.credential.error.upstreamUnavailable':
    'The provider is temporarily unavailable. Nothing was created; try again.',
  'importHub.credential.error.responseInvalid':
    'The provider returned an invalid response. Nothing was created; try again.',
  'importHub.credential.error.sourceTooLarge': 'This source is too large for a single secure import.',
  'importHub.credential.error.previewFailed': 'The source could not be previewed. Nothing was created; try again.',
  'importHub.credential.error.consentRequired': 'Choose keep or redact for every detected finding.',
  'importHub.credential.error.commitFailed':
    'The reviewed project could not be created. Nothing was created; validate the source again and retry.',
  'importHub.credential.error.cancelFailed':
    'The staged import could not be cancelled. It remains recoverable; try again.',
  'importHub.credential.error.quota': 'Your organization has reached its project limit.',
  'importHub.credential.error.retry': 'Try again',
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
    'Récupérez et vérifiez la configuration réelle d’un projet Vercel avant de créer un projet persistant.',
  'importHub.provider.vercel.badge': 'Connecter le jeton',
  'importHub.provider.figma.label': 'Figma',
  'importHub.provider.figma.description':
    'Récupérez et vérifiez un instantané réel de document Figma avant de créer un projet persistant.',
  'importHub.provider.figma.badge': 'Connecter le jeton',
  'importHub.provider.claude.label': 'Claude',
  'importHub.provider.claude.description':
    'Validez l’accès Anthropic, puis vérifiez et importez un export explicite d’artifact Claude.',
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
  'importHub.credential.connection.title': '1. Connecter l’accès fournisseur',
  'importHub.credential.connection.description':
    'L’identifiant est validé par {{label}}, chiffré au repos et jamais copié dans le projet importé.',
  'importHub.credential.connection.connected': 'Connexion vérifiée · {{account}}',
  'importHub.credential.connection.reconnect': 'Cette connexion doit être remplacée avant l’import.',
  'importHub.credential.connection.required': 'Connectez {{label}} avant de sélectionner une source.',
  'importHub.credential.connection.help': 'Ouvrir la page des identifiants {{label}}',
  'importHub.credential.connection.token.vercel': 'Jeton d’accès Vercel',
  'importHub.credential.connection.token.figma': 'Jeton d’accès personnel Figma',
  'importHub.credential.connection.token.claude': 'Clé API Anthropic',
  'importHub.credential.source.title': '2. Sélectionner et valider la source',
  'importHub.credential.source.description':
    'E-Code valide la source demandée sur le serveur et la prépare de manière isolée. Aucun projet n’est créé avant votre validation de l’aperçu.',
  'importHub.credential.source.vercel.label': 'ID ou nom du projet Vercel',
  'importHub.credential.source.vercel.placeholder': 'acme-web',
  'importHub.credential.source.vercel.scopeLabel': 'ID d’équipe (facultatif)',
  'importHub.credential.source.vercel.scopePlaceholder': 'team_…',
  'importHub.credential.source.vercel.scopeHelp':
    'Requis uniquement si le projet appartient à une équipe Vercel qui ne peut pas être déduite du jeton.',
  'importHub.credential.source.figma.label': 'URL ou clé du fichier Figma',
  'importHub.credential.source.figma.placeholder': 'https://www.figma.com/design/…',
  'importHub.credential.source.figma.help':
    'Utilisez un jeton avec current_user:read pour valider la connexion et file_content:read pour ce document.',
  'importHub.credential.source.claude.label': 'Nom de l’artifact',
  'importHub.credential.source.claude.placeholder': 'Artifact de paiement',
  'importHub.credential.source.claude.payloadLabel': 'Source exportée de l’artifact',
  'importHub.credential.source.claude.payloadHelp':
    'Anthropic n’expose pas l’historique des conversations ou des artifacts Claude par son API. Collez la source que vous avez explicitement exportée ; E-Code l’importe à l’identique.',
  'importHub.credential.source.claude.pathLabel': 'Chemin du fichier cible',
  'importHub.credential.source.claude.pathPlaceholder': 'src/artifact.tsx',
  'importHub.credential.source.preview': 'Valider et prévisualiser',
  'importHub.credential.source.previewing': 'Récupération et validation…',
  'importHub.credential.source.progress': 'Récupération de la source du fournisseur',
  'importHub.credential.preview.title': '3. Vérifier avant la création',
  'importHub.credential.preview.description':
    'Cet aperçu provient de la source validée ci-dessous. Le projet cible n’existe toujours pas.',
  'importHub.credential.preview.files': 'Fichiers à créer',
  'importHub.credential.preview.summary': '{{files}} fichiers · {{bytes}}',
  'importHub.credential.preview.fact.framework': 'Framework',
  'importHub.credential.preview.fact.repository': 'Dépôt lié',
  'importHub.credential.preview.fact.updatedAt': 'Mise à jour fournisseur',
  'importHub.credential.preview.fact.pages': 'Pages',
  'importHub.credential.preview.fact.components': 'Composants',
  'importHub.credential.preview.fact.componentSets': 'Ensembles de composants',
  'importHub.credential.preview.fact.version': 'Version',
  'importHub.credential.preview.fact.sourceFormat': 'Format source',
  'importHub.credential.preview.fact.sourceLines': 'Lignes',
  'importHub.credential.preview.fact.sourceCharacters': 'Caractères',
  'importHub.credential.preview.fact.verifiedModel': 'Modèle API vérifié',
  'importHub.credential.preview.warning.vercelConfigurationOnly':
    'L’API de projet Vercel expose la configuration et les références de dépôt, pas les fichiers source. Cet import crée un instantané de configuration vérifiable ; importez séparément le dépôt Git lié pour récupérer le code.',
  'importHub.credential.preview.warning.figmaDocumentSnapshot':
    'Le document Figma JSON complet est importé comme instantané de design. E-Code ne prétend pas qu’il s’agit de code applicatif généré.',
  'importHub.credential.preview.warning.claudeExactSource':
    'Seule la source affichée ici est importée. E-Code ne génère ni ne déduit les fichiers manquants de l’artifact Claude.',
  'importHub.credential.preview.findings.title': 'Vérification des secrets requise',
  'importHub.credential.preview.findings.description':
    'L’analyse isolée a détecté un contenu ressemblant à un secret. Choisissez une action pour chaque résultat avant de créer le projet.',
  'importHub.credential.preview.finding': '{{path}}, ligne {{line}} · {{kind}} · {{preview}}',
  'importHub.credential.preview.keep': 'Conserver cette valeur',
  'importHub.credential.preview.redact': 'Masquer la valeur',
  'importHub.credential.preview.create': 'Créer le projet vérifié',
  'importHub.credential.preview.creating': 'Création du projet…',
  'importHub.credential.preview.progress': 'Création du projet vérifié',
  'importHub.credential.preview.cancel': 'Annuler cet import préparé',
  'importHub.credential.preview.cancelling': 'Annulation…',
  'importHub.credential.preview.cancelProgress': 'Annulation de l’import préparé',
  'importHub.credential.error.load':
    'Impossible de charger l’état de connexion. Aucun identifiant ni import n’a été modifié.',
  'importHub.credential.error.notConnected': 'Connectez ce fournisseur avant de valider une source.',
  'importHub.credential.error.credentialExpired':
    'Cet identifiant a expiré. Reconnectez le fournisseur, puis réessayez.',
  'importHub.credential.error.credentialUnavailable':
    'L’identifiant chiffré ne peut pas être utilisé. Reconnectez le fournisseur, puis réessayez.',
  'importHub.credential.error.connectorDisabled': 'Un administrateur a désactivé ce connecteur.',
  'importHub.credential.error.sourceRequired': 'Renseignez tous les champs source requis avant de continuer.',
  'importHub.credential.error.sourceInvalid': 'La référence source ou le chemin cible est invalide.',
  'importHub.credential.error.sourceNotFound': 'Le fournisseur ne trouve pas cette source.',
  'importHub.credential.error.sourceForbidden': 'Cet identifiant n’est pas autorisé à lire la source.',
  'importHub.credential.error.upstreamUnavailable':
    'Le fournisseur est temporairement indisponible. Rien n’a été créé ; réessayez.',
  'importHub.credential.error.responseInvalid':
    'Le fournisseur a renvoyé une réponse invalide. Rien n’a été créé ; réessayez.',
  'importHub.credential.error.sourceTooLarge': 'Cette source est trop volumineuse pour un import sécurisé unique.',
  'importHub.credential.error.previewFailed': 'Impossible de prévisualiser la source. Rien n’a été créé ; réessayez.',
  'importHub.credential.error.consentRequired': 'Choisissez de conserver ou masquer chaque résultat détecté.',
  'importHub.credential.error.commitFailed':
    'Impossible de créer le projet vérifié. Rien n’a été créé ; validez de nouveau la source, puis réessayez.',
  'importHub.credential.error.cancelFailed': 'Impossible d’annuler l’import préparé. Il reste récupérable ; réessayez.',
  'importHub.credential.error.quota': 'Votre organisation a atteint sa limite de projets.',
  'importHub.credential.error.retry': 'Réessayer',
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
