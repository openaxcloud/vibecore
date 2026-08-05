import { resolveMarketingLanguage } from './marketing';

export interface RepositoryDeploymentCopy {
  errors: {
    authenticationRequired: string;
    couldNotParseResponse: string;
    tokenExpired: string;
    apiRateLimit: string;
    apiRateLimitWait: string;
    fetchWithReason: string;
    parseRepositoryData: string;
    fetchRecent: string;
    connectFirst: string;
    repositoryNameRequired: string;
    repositoryNameInvalid: string;
    repositoryNameTooLong: string;
    pushFailed: string;
    network: string;
    authenticationFailed: string;
    accessDenied: string;
    resourceNotFound: string;
    nameAlreadyExists: string;
    validationFailed: string;
    timeout: string;
    generic: string;
    retry: string;
    resetSoon: string;
  };
  progress: {
    sanitized: string;
    updatingVisibility: string;
    uploadingExisting: string;
    updated: string;
    creating: string;
    created: string;
    deploymentCompleted: string;
    deployedFiles: string;
  };
  repositoryUpdate: {
    repositoryExists: string;
    publicToPrivate: string;
    privateToPublic: string;
    visibilityChange: string;
    title: string;
    confirm: string;
  };
  success: {
    title: string;
    description: string;
    repositoryUrl: string;
    urlCopied: string;
    urlCopyFailed: string;
    pushedFiles: string;
    moreFiles: string;
    viewRepository: string;
    copyUrl: string;
    close: string;
  };
  connection: {
    title: string;
    description: string;
    connectAccount: string;
  };
  form: {
    title: string;
    description: string;
    closeDialog: string;
    repositoryName: string;
    repositoryNamePlaceholder: string;
    repositoryNameHelp: string;
    willCreateAs: string;
    recentRepositories: string;
    repositoryCount: string;
    searchRepositories: string;
    noRepositories: string;
    noRepositoriesDescription: string;
    noMatchingRepositories: string;
    tryDifferentSearch: string;
    private: string;
    public: string;
    loadingRepositories: string;
    makePrivate: string;
    privateDescription: string;
    cancel: string;
    deploying: string;
    deploy: string;
  };
}

export const repositoryDeploymentEn: RepositoryDeploymentCopy = {
  errors: {
    authenticationRequired: '{{provider}} authentication required',
    couldNotParseResponse: 'Could not parse error response',
    tokenExpired: '{{provider}} token expired. Please reconnect your account.',
    apiRateLimit: '{{provider}} API rate limit exceeded. Limit resets at {{time}}.',
    apiRateLimitWait: '{{provider}} API rate limit exceeded. Please wait a moment and try again.',
    fetchWithReason: 'Failed to fetch repositories: {{reason}}',
    parseRepositoryData: 'Failed to parse repository data',
    fetchRecent: 'Failed to fetch recent repositories',
    connectFirst: 'Please connect your {{provider}} account in Settings > Connections first',
    repositoryNameRequired: 'Repository name is required',
    repositoryNameInvalid: 'Repository name must contain at least one alphanumeric character',
    repositoryNameTooLong: 'Repository name is too long (maximum 100 characters)',
    pushFailed: 'Failed to push to {{provider}}',
    network: 'Network error. Please check your internet connection and try again.',
    authenticationFailed: '{{provider}} authentication failed. Please check your access token and permissions.',
    accessDenied:
      'Access denied. Your {{provider}} token may not have sufficient permissions to create or modify repositories.',
    resourceNotFound: 'Repository or {{provider}} resource not found. Check the repository name and your permissions.',
    nameAlreadyExists: 'A repository with this name already exists. Please choose a different name.',
    validationFailed: 'Repository validation failed. Please check the repository name and settings.',
    timeout: 'Request timed out. Please check your connection and try again.',
    generic: '{{provider}} could not complete the deployment. Check the connection and try again.',
    retry: '{{message}} You can try again.',
    resetSoon: 'soon',
  },
  progress: {
    sanitized: 'Repository name adjusted to “{{name}}” to meet {{provider}} requirements',
    updatingVisibility: 'Updating repository visibility…',
    uploadingExisting: 'Uploading files to the existing repository…',
    updated: 'Repository updated successfully.',
    creating: 'Creating the repository…',
    created: 'Repository created successfully.',
    deploymentCompleted: '{{provider}} deployment completed successfully',
    deployedFiles: 'Deployed {{count}} files to the {{provider}} repository {{name}}.',
  },
  repositoryUpdate: {
    repositoryExists:
      'Repository “{{name}}” already exists. Do you want to update it? This will add or modify files in the repository.',
    publicToPrivate: 'This will also change the repository from public to private.',
    privateToPublic: 'This will also change the repository from private to public.',
    visibilityChange: 'This will also change the repository from {{from}} to {{to}}.',
    title: 'Update existing repository?',
    confirm: 'Update repository',
  },
  success: {
    title: 'Successfully pushed to {{provider}}',
    description: 'Your code is now available on {{provider}}',
    repositoryUrl: 'Repository URL',
    urlCopied: 'URL copied to clipboard',
    urlCopyFailed: 'Failed to copy URL',
    pushedFiles: 'Pushed files ({{count}})',
    moreFiles: '+{{count}} more files',
    viewRepository: 'View repository',
    copyUrl: 'Copy URL',
    close: 'Close',
  },
  connection: {
    title: '{{provider}} connection required',
    description: 'To deploy your code to {{provider}}, connect your {{provider}} account first.',
    connectAccount: 'Connect {{provider}} account',
  },
  form: {
    title: 'Deploy to {{provider}}',
    description: 'Deploy your code to a new or existing {{provider}} repository',
    closeDialog: 'Close dialog',
    repositoryName: 'Repository name',
    repositoryNamePlaceholder: 'my-awesome-project',
    repositoryNameHelp: 'Repository names may contain letters, numbers, hyphens, underscores, and spaces.',
    willCreateAs: 'Will be created as:',
    recentRepositories: 'Recent repositories',
    repositoryCount: '{{shown}} of {{total}}',
    searchRepositories: 'Search repositories…',
    noRepositories: 'No repositories found',
    noRepositoriesDescription: 'We could not find any repositories in your {{provider}} account.',
    noMatchingRepositories: 'No matching repositories',
    tryDifferentSearch: 'Try a different search term.',
    private: 'Private',
    public: 'Public',
    loadingRepositories: 'Loading repositories…',
    makePrivate: 'Make repository private',
    privateDescription: 'Private repositories are visible only to you and the people you share them with.',
    cancel: 'Cancel',
    deploying: 'Deploying…',
    deploy: 'Deploy to {{provider}}',
  },
};

export const repositoryDeploymentFr: RepositoryDeploymentCopy = {
  errors: {
    authenticationRequired: 'Authentification {{provider}} requise',
    couldNotParseResponse: 'Impossible d’analyser la réponse d’erreur',
    tokenExpired: 'Le jeton {{provider}} a expiré. Reconnectez votre compte.',
    apiRateLimit: 'La limite de l’API {{provider}} est atteinte. Elle sera réinitialisée à {{time}}.',
    apiRateLimitWait: 'La limite de l’API {{provider}} est atteinte. Patientez un instant, puis réessayez.',
    fetchWithReason: 'Impossible de récupérer les dépôts : {{reason}}',
    parseRepositoryData: 'Impossible d’analyser les données des dépôts',
    fetchRecent: 'Impossible de récupérer les dépôts récents',
    connectFirst: 'Connectez d’abord votre compte {{provider}} dans Paramètres > Connexions',
    repositoryNameRequired: 'Le nom du dépôt est obligatoire',
    repositoryNameInvalid: 'Le nom du dépôt doit contenir au moins un caractère alphanumérique',
    repositoryNameTooLong: 'Le nom du dépôt est trop long (100 caractères maximum)',
    pushFailed: 'Impossible d’envoyer le projet vers {{provider}}',
    network: 'Erreur réseau. Vérifiez votre connexion Internet, puis réessayez.',
    authenticationFailed: 'L’authentification {{provider}} a échoué. Vérifiez le jeton d’accès et ses autorisations.',
    accessDenied:
      'Accès refusé. Le jeton {{provider}} ne dispose peut-être pas des autorisations nécessaires pour modifier les dépôts.',
    resourceNotFound: 'Dépôt ou ressource {{provider}} introuvable. Vérifiez le nom et vos autorisations.',
    nameAlreadyExists: 'Un dépôt portant ce nom existe déjà. Choisissez un autre nom.',
    validationFailed: 'La validation du dépôt a échoué. Vérifiez son nom et ses paramètres.',
    timeout: 'La requête a expiré. Vérifiez votre connexion, puis réessayez.',
    generic: '{{provider}} n’a pas pu terminer le déploiement. Vérifiez la connexion, puis réessayez.',
    retry: '{{message}} Vous pouvez réessayer.',
    resetSoon: 'prochainement',
  },
  progress: {
    sanitized: 'Nom du dépôt ajusté en « {{name}} » pour respecter les règles de {{provider}}',
    updatingVisibility: 'Mise à jour de la visibilité du dépôt…',
    uploadingExisting: 'Téléversement des fichiers vers le dépôt existant…',
    updated: 'Dépôt mis à jour avec succès.',
    creating: 'Création du dépôt…',
    created: 'Dépôt créé avec succès.',
    deploymentCompleted: 'Déploiement vers {{provider}} terminé avec succès',
    deployedFiles: '{{count}} fichiers déployés vers le dépôt {{provider}} {{name}}.',
  },
  repositoryUpdate: {
    repositoryExists:
      'Le dépôt « {{name}} » existe déjà. Voulez-vous le mettre à jour ? Des fichiers seront ajoutés ou modifiés.',
    publicToPrivate: 'Le dépôt passera également de public à privé.',
    privateToPublic: 'Le dépôt passera également de privé à public.',
    visibilityChange: 'Le dépôt passera également de {{from}} à {{to}}.',
    title: 'Mettre à jour le dépôt existant ?',
    confirm: 'Mettre à jour le dépôt',
  },
  success: {
    title: 'Projet envoyé vers {{provider}} avec succès',
    description: 'Votre code est maintenant disponible sur {{provider}}',
    repositoryUrl: 'URL du dépôt',
    urlCopied: 'URL copiée dans le presse-papiers',
    urlCopyFailed: 'Impossible de copier l’URL',
    pushedFiles: 'Fichiers envoyés ({{count}})',
    moreFiles: '+{{count}} fichiers supplémentaires',
    viewRepository: 'Voir le dépôt',
    copyUrl: 'Copier l’URL',
    close: 'Fermer',
  },
  connection: {
    title: 'Connexion {{provider}} requise',
    description: 'Pour déployer votre code vers {{provider}}, connectez d’abord votre compte {{provider}}.',
    connectAccount: 'Connecter le compte {{provider}}',
  },
  form: {
    title: 'Déployer vers {{provider}}',
    description: 'Déployez votre code vers un dépôt {{provider}} nouveau ou existant',
    closeDialog: 'Fermer la boîte de dialogue',
    repositoryName: 'Nom du dépôt',
    repositoryNamePlaceholder: 'mon-super-projet',
    repositoryNameHelp: 'Le nom peut contenir des lettres, chiffres, tirets, traits de soulignement et espaces.',
    willCreateAs: 'Sera créé sous le nom :',
    recentRepositories: 'Dépôts récents',
    repositoryCount: '{{shown}} sur {{total}}',
    searchRepositories: 'Rechercher des dépôts…',
    noRepositories: 'Aucun dépôt trouvé',
    noRepositoriesDescription: 'Aucun dépôt n’a été trouvé dans votre compte {{provider}}.',
    noMatchingRepositories: 'Aucun dépôt correspondant',
    tryDifferentSearch: 'Essayez un autre terme de recherche.',
    private: 'Privé',
    public: 'Public',
    loadingRepositories: 'Chargement des dépôts…',
    makePrivate: 'Rendre le dépôt privé',
    privateDescription: 'Les dépôts privés ne sont visibles que par vous et les personnes autorisées.',
    cancel: 'Annuler',
    deploying: 'Déploiement en cours…',
    deploy: 'Déployer vers {{provider}}',
  },
};

export function getRepositoryDeploymentCopy(language?: string | null): RepositoryDeploymentCopy {
  return resolveMarketingLanguage(language) === 'fr' ? repositoryDeploymentFr : repositoryDeploymentEn;
}

export function formatRepositoryDeploymentCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatRepositoryDeploymentNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatRepositoryDeploymentDate(value: string | number | Date, language?: string | null): string {
  return new Intl.DateTimeFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function formatRepositoryDeploymentTime(value: string | number | Date, language?: string | null): string {
  return new Intl.DateTimeFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatRepositoryDeploymentSize(bytes: number, language?: string | null): string {
  const size = bytes / 1024;

  const formatted = new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(size);

  return `${formatted}\u00a0KB`;
}
