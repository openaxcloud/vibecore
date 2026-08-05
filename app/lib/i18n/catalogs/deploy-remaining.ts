import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const deployRemainingEn = {
  'deployRemaining.button.deploy': 'Deploy',
  'deployRemaining.button.deployingTo': 'Deploying to {provider}…',
  'deployRemaining.button.failed': 'The deployment could not be started. Please try again.',
  'deployRemaining.button.netlifyDisconnected': 'No Netlify account connected',
  'deployRemaining.button.netlify': 'Deploy to Netlify',
  'deployRemaining.button.vercelDisconnected': 'No Vercel account connected',
  'deployRemaining.button.vercel': 'Deploy to Vercel',
  'deployRemaining.button.github': 'Deploy to GitHub',
  'deployRemaining.button.gitlabDisconnected': 'No GitLab account connected',
  'deployRemaining.button.gitlab': 'Deploy to GitLab',
  'deployRemaining.button.cloudflareSoon': 'Deploy to Cloudflare (coming soon)',
  'deployRemaining.button.provider.netlify': 'Netlify',
  'deployRemaining.button.provider.vercel': 'Vercel',
  'deployRemaining.button.provider.github': 'GitHub',
  'deployRemaining.button.provider.gitlab': 'GitLab',
  'deployRemaining.repository.noActiveChat': 'No active chat was found.',
  'deployRemaining.repository.noActiveProject': 'No active project is available to deploy.',
  'deployRemaining.repository.buildFailed':
    'The project build failed. Review the terminal output, fix the errors, and try again.',
  'deployRemaining.repository.github.connectFirst':
    'Connect your GitHub account in Settings > Connections before deploying.',
  'deployRemaining.repository.github.artifactTitle': 'GitHub deployment',
  'deployRemaining.repository.github.failed': 'The GitHub deployment preparation could not be completed.',
  'deployRemaining.repository.github.success': '🚀 GitHub deployment preparation completed successfully.',
  'deployRemaining.repository.gitlab.connectFirst':
    'Connect your GitLab account in Settings > Connections before deploying.',
  'deployRemaining.repository.gitlab.artifactTitle': 'GitLab deployment',
  'deployRemaining.repository.gitlab.failed': 'The GitLab deployment preparation could not be completed.',
  'deployRemaining.repository.gitlab.success': '🚀 GitLab deployment preparation completed successfully.',
  'deployRemaining.repository.status.idle': 'Ready to prepare the deployment.',
  'deployRemaining.repository.status.building': 'Building the project…',
  'deployRemaining.repository.status.preparing': 'Preparing the repository deployment…',
  'deployRemaining.repository.status.success': 'Deployment preparation completed successfully.',
  'deployRemaining.repository.status.error': 'Deployment preparation failed.',
  'deployRemaining.alert.generic.successTitle': 'Deployment complete',
  'deployRemaining.alert.generic.errorTitle': 'Deployment failed',
  'deployRemaining.alert.generic.infoTitle': 'Deployment update',
  'deployRemaining.alert.generic.successDescription': 'The deployment completed successfully.',
  'deployRemaining.alert.generic.errorDescription': 'The deployment could not be completed. Please try again.',
  'deployRemaining.alert.generic.infoDescription': 'The deployment status has been updated.',
  'deployRemaining.alert.buildingTitle': 'Building your project',
  'deployRemaining.alert.deployingTitle': 'Deploying your application',
  'deployRemaining.alert.completedTitle': 'Deployment complete',
  'deployRemaining.alert.preparingBuild': 'Preparing to build your project…',
  'deployRemaining.alert.building': 'Building your project…',
  'deployRemaining.alert.buildCompleted': 'Your project was built successfully.',
  'deployRemaining.alert.buildFailed': 'The project build failed. Review the terminal output, then try again.',
  'deployRemaining.alert.preparingDeployment': 'Preparing your deployment…',
  'deployRemaining.alert.deploying': 'Deploying your application…',
  'deployRemaining.alert.deploymentCompleted': 'Your application was deployed successfully.',
  'deployRemaining.alert.deploymentFailed': 'The deployment failed. Review the terminal logs, then try again.',
  'deployRemaining.alert.progressLabel': 'Deployment progress',
  'deployRemaining.alert.buildStep': 'Build',
  'deployRemaining.alert.deployStep': 'Deploy',
  'deployRemaining.alert.viewSite': 'View deployed site',
  'deployRemaining.alert.askECode': 'Ask E-Code',
  'deployRemaining.alert.dismiss': 'Dismiss',
  'deployRemaining.alert.fixPrompt': '*Fix this deployment error*\n```\n{details}\n```\n',
  'deployRemaining.selector.legend': 'Deployment type',
  'deployRemaining.selector.soon': 'Soon',
  'deployRemaining.selector.unavailableTitle': 'Coming soon — requires managed compute infrastructure',
  'deployRemaining.type.static.name': 'Static',
  'deployRemaining.type.static.tagline': 'Build once, serve the output as a fast static site.',
  'deployRemaining.type.static.description':
    'Runs your build command and publishes the output directory to a public URL. Best for SPAs, generated sites and front-end apps that do not need a running server.',
  'deployRemaining.type.static.bestFor': 'Static sites & SPAs (React, Vue, Astro, plain HTML)',
  'deployRemaining.type.autoscale.name': 'Autoscale',
  'deployRemaining.type.autoscale.tagline': 'Run a server that scales with traffic and to zero when idle.',
  'deployRemaining.type.autoscale.description':
    'Runs your app as a managed HTTP service on a durable runtime. Best for full-stack apps with a backend (Next.js SSR, Express, Remix server). The runtime, build and start commands are auto-detected from your project.',
  'deployRemaining.type.autoscale.bestFor': 'Full-stack apps with a server (SSR, APIs)',
  'deployRemaining.type.reservedVm.name': 'Reserved VM',
  'deployRemaining.type.reservedVm.tagline': 'A dedicated always-on machine for predictable workloads.',
  'deployRemaining.type.reservedVm.description':
    'Runs your app on a dedicated, always-on instance with reserved CPU/RAM. Best for stateful servers, WebSocket apps, bots and workloads that must never cold-start.',
  'deployRemaining.type.reservedVm.bestFor': 'Always-on servers, bots and WebSocket apps',
  'deployRemaining.type.reservedVm.requires.code.selection': 'Reserved-tier selection and provisioning route',
  'deployRemaining.type.reservedVm.requires.code.lifecycle': 'Lifecycle controls (start, stop and restart) and logs',
  'deployRemaining.type.reservedVm.requires.infra.compute': 'Dedicated node pool or reserved compute',
  'deployRemaining.type.reservedVm.requires.infra.ingress': 'Host-based ingress and TLS',
  'deployRemaining.type.reservedVm.requires.infra.storage': 'Persistent attached storage',
  'deployRemaining.type.scheduled.name': 'Scheduled',
  'deployRemaining.type.scheduled.tagline': 'Run a command on a cron schedule.',
  'deployRemaining.type.scheduled.description':
    'Runs a command on a recurring schedule inside your project sandbox, then stops. Billing covers only the time it actually ran (duration × machine size), not 24/7. Every run is kept with its exit code, duration and full logs. Best for batch jobs, data syncs, report generation and periodic maintenance.',
  'deployRemaining.type.scheduled.bestFor': 'Cron jobs, batch tasks and periodic syncs',
  'deployRemaining.provider.static.name': 'Static export',
  'deployRemaining.provider.static.description': 'Create an immutable static artifact.',
  'deployRemaining.provider.vercel.name': 'Vercel',
  'deployRemaining.provider.vercel.description': 'Reuse the existing Bolt Vercel deployment path.',
  'deployRemaining.provider.netlify.name': 'Netlify',
  'deployRemaining.provider.netlify.description': 'Reuse the existing Bolt Netlify deployment path.',
  'deployRemaining.provider.githubPages.name': 'GitHub Pages',
  'deployRemaining.provider.githubPages.description': 'Publish static output through the GitHub integration.',
  'deployRemaining.provider.cloudflarePages.name': 'Cloudflare Pages',
  'deployRemaining.provider.cloudflarePages.description': 'Deploy static output to Cloudflare Pages.',
  'deployRemaining.provider.googleCloudRun.name': 'Google Cloud Run',
  'deployRemaining.provider.googleCloudRun.description': 'Build an isolated user application service.',
  'deployRemaining.provider.docker.name': 'Custom Dockerfile',
  'deployRemaining.provider.docker.description': 'Use the enterprise-only isolated builder.',
} as const;

export type DeployRemainingKey = keyof typeof deployRemainingEn;
export type DeployRemainingCopy = Readonly<Record<DeployRemainingKey, string>>;

export const deployRemainingFr: DeployRemainingCopy = {
  'deployRemaining.button.deploy': 'Déployer',
  'deployRemaining.button.deployingTo': 'Déploiement vers {provider}…',
  'deployRemaining.button.failed': 'Impossible de lancer le déploiement. Veuillez réessayer.',
  'deployRemaining.button.netlifyDisconnected': 'Aucun compte Netlify connecté',
  'deployRemaining.button.netlify': 'Déployer vers Netlify',
  'deployRemaining.button.vercelDisconnected': 'Aucun compte Vercel connecté',
  'deployRemaining.button.vercel': 'Déployer vers Vercel',
  'deployRemaining.button.github': 'Déployer vers GitHub',
  'deployRemaining.button.gitlabDisconnected': 'Aucun compte GitLab connecté',
  'deployRemaining.button.gitlab': 'Déployer vers GitLab',
  'deployRemaining.button.cloudflareSoon': 'Déployer vers Cloudflare (bientôt disponible)',
  'deployRemaining.button.provider.netlify': 'Netlify',
  'deployRemaining.button.provider.vercel': 'Vercel',
  'deployRemaining.button.provider.github': 'GitHub',
  'deployRemaining.button.provider.gitlab': 'GitLab',
  'deployRemaining.repository.noActiveChat': 'Aucune conversation active n’a été trouvée.',
  'deployRemaining.repository.noActiveProject': 'Aucun projet actif n’est disponible pour le déploiement.',
  'deployRemaining.repository.buildFailed':
    'La compilation du projet a échoué. Consultez la sortie du terminal, corrigez les erreurs, puis réessayez.',
  'deployRemaining.repository.github.connectFirst':
    'Connectez votre compte GitHub dans Paramètres > Connexions avant de lancer le déploiement.',
  'deployRemaining.repository.github.artifactTitle': 'Déploiement GitHub',
  'deployRemaining.repository.github.failed': 'Impossible de terminer la préparation du déploiement GitHub.',
  'deployRemaining.repository.github.success': '🚀 Préparation du déploiement GitHub terminée avec succès.',
  'deployRemaining.repository.gitlab.connectFirst':
    'Connectez votre compte GitLab dans Paramètres > Connexions avant de lancer le déploiement.',
  'deployRemaining.repository.gitlab.artifactTitle': 'Déploiement GitLab',
  'deployRemaining.repository.gitlab.failed': 'Impossible de terminer la préparation du déploiement GitLab.',
  'deployRemaining.repository.gitlab.success': '🚀 Préparation du déploiement GitLab terminée avec succès.',
  'deployRemaining.repository.status.idle': 'Prêt à préparer le déploiement.',
  'deployRemaining.repository.status.building': 'Compilation du projet…',
  'deployRemaining.repository.status.preparing': 'Préparation du déploiement du dépôt…',
  'deployRemaining.repository.status.success': 'Préparation du déploiement terminée avec succès.',
  'deployRemaining.repository.status.error': 'La préparation du déploiement a échoué.',
  'deployRemaining.alert.generic.successTitle': 'Déploiement terminé',
  'deployRemaining.alert.generic.errorTitle': 'Échec du déploiement',
  'deployRemaining.alert.generic.infoTitle': 'Mise à jour du déploiement',
  'deployRemaining.alert.generic.successDescription': 'Le déploiement s’est terminé avec succès.',
  'deployRemaining.alert.generic.errorDescription': 'Impossible de terminer le déploiement. Veuillez réessayer.',
  'deployRemaining.alert.generic.infoDescription': 'L’état du déploiement a été mis à jour.',
  'deployRemaining.alert.buildingTitle': 'Compilation de votre projet',
  'deployRemaining.alert.deployingTitle': 'Déploiement de votre application',
  'deployRemaining.alert.completedTitle': 'Déploiement terminé',
  'deployRemaining.alert.preparingBuild': 'Préparation de la compilation de votre projet…',
  'deployRemaining.alert.building': 'Compilation de votre projet…',
  'deployRemaining.alert.buildCompleted': 'Votre projet a été compilé avec succès.',
  'deployRemaining.alert.buildFailed':
    'La compilation du projet a échoué. Consultez la sortie du terminal, puis réessayez.',
  'deployRemaining.alert.preparingDeployment': 'Préparation de votre déploiement…',
  'deployRemaining.alert.deploying': 'Déploiement de votre application…',
  'deployRemaining.alert.deploymentCompleted': 'Votre application a été déployée avec succès.',
  'deployRemaining.alert.deploymentFailed':
    'Le déploiement a échoué. Consultez les journaux du terminal, puis réessayez.',
  'deployRemaining.alert.progressLabel': 'Progression du déploiement',
  'deployRemaining.alert.buildStep': 'Compilation',
  'deployRemaining.alert.deployStep': 'Déploiement',
  'deployRemaining.alert.viewSite': 'Voir le site déployé',
  'deployRemaining.alert.askECode': 'Demander à E-Code',
  'deployRemaining.alert.dismiss': 'Fermer',
  'deployRemaining.alert.fixPrompt': '*Corrigez cette erreur de déploiement*\n```\n{details}\n```\n',
  'deployRemaining.selector.legend': 'Type de déploiement',
  'deployRemaining.selector.soon': 'Bientôt',
  'deployRemaining.selector.unavailableTitle': 'Bientôt disponible — nécessite une infrastructure de calcul managée',
  'deployRemaining.type.static.name': 'Statique',
  'deployRemaining.type.static.tagline': 'Compilez une fois, puis servez le résultat comme site statique rapide.',
  'deployRemaining.type.static.description':
    'Exécute votre commande de compilation et publie le dossier de sortie sur une URL publique. Idéal pour les SPA, les sites générés et les interfaces utilisateur qui ne nécessitent pas de serveur actif.',
  'deployRemaining.type.static.bestFor': 'Sites statiques et SPA (React, Vue, Astro, HTML)',
  'deployRemaining.type.autoscale.name': 'Mise à l’échelle automatique',
  'deployRemaining.type.autoscale.tagline':
    'Exécutez un serveur qui s’adapte au trafic et revient à zéro lorsqu’il est inactif.',
  'deployRemaining.type.autoscale.description':
    'Exécute votre application comme un service HTTP managé sur un environnement d’exécution durable. Idéal pour les applications complètes avec service applicatif (SSR Next.js, Express, serveur Remix). L’environnement d’exécution ainsi que les commandes de compilation et de démarrage sont détectés automatiquement dans votre projet.',
  'deployRemaining.type.autoscale.bestFor': 'Applications complètes avec serveur (SSR, API)',
  'deployRemaining.type.reservedVm.name': 'VM réservée',
  'deployRemaining.type.reservedVm.tagline': 'Une machine dédiée, toujours active, pour les charges prévisibles.',
  'deployRemaining.type.reservedVm.description':
    'Exécute votre application sur une instance dédiée, toujours active, avec CPU et RAM réservés. Idéal pour les serveurs avec état, les applications WebSocket, les bots et les charges qui ne doivent jamais subir de démarrage à froid.',
  'deployRemaining.type.reservedVm.bestFor': 'Serveurs toujours actifs, bots et applications WebSocket',
  'deployRemaining.type.reservedVm.requires.code.selection':
    'Sélection de l’offre réservée et route de provisionnement',
  'deployRemaining.type.reservedVm.requires.code.lifecycle':
    'Commandes de cycle de vie (démarrer, arrêter et redémarrer) et journaux',
  'deployRemaining.type.reservedVm.requires.infra.compute': 'Pool de nœuds dédié ou capacité de calcul réservée',
  'deployRemaining.type.reservedVm.requires.infra.ingress': 'Routage entrant basé sur l’hôte et TLS',
  'deployRemaining.type.reservedVm.requires.infra.storage': 'Stockage persistant attaché',
  'deployRemaining.type.scheduled.name': 'Planifié',
  'deployRemaining.type.scheduled.tagline': 'Exécutez une commande selon une planification cron.',
  'deployRemaining.type.scheduled.description':
    'Exécute une commande de façon récurrente dans le bac à sable de votre projet, puis s’arrête. Seul le temps d’exécution réel est facturé (durée × taille de la machine), et non 24 h/24. Chaque exécution conserve son code de sortie, sa durée et l’intégralité de ses journaux. Idéal pour les traitements par lots, les synchronisations de données, la génération de rapports et la maintenance périodique.',
  'deployRemaining.type.scheduled.bestFor': 'Tâches cron, traitements par lots et synchronisations périodiques',
  'deployRemaining.provider.static.name': 'Export statique',
  'deployRemaining.provider.static.description': 'Créer un artefact statique immuable.',
  'deployRemaining.provider.vercel.name': 'Vercel',
  'deployRemaining.provider.vercel.description': 'Réutiliser le parcours de déploiement Bolt vers Vercel.',
  'deployRemaining.provider.netlify.name': 'Netlify',
  'deployRemaining.provider.netlify.description': 'Réutiliser le parcours de déploiement Bolt vers Netlify.',
  'deployRemaining.provider.githubPages.name': 'GitHub Pages',
  'deployRemaining.provider.githubPages.description': 'Publier la sortie statique via l’intégration GitHub.',
  'deployRemaining.provider.cloudflarePages.name': 'Cloudflare Pages',
  'deployRemaining.provider.cloudflarePages.description': 'Déployer la sortie statique vers Cloudflare Pages.',
  'deployRemaining.provider.googleCloudRun.name': 'Google Cloud Run',
  'deployRemaining.provider.googleCloudRun.description': 'Créer un service applicatif utilisateur isolé.',
  'deployRemaining.provider.docker.name': 'Dockerfile personnalisé',
  'deployRemaining.provider.docker.description': 'Utiliser le moteur de compilation isolé réservé aux entreprises.',
};

export type DeployRemainingLanguage = 'en' | 'fr';
export type RepositoryDeployProvider = 'github' | 'gitlab';
export type RepositoryDeployErrorCode =
  | 'connect-first'
  | 'no-active-chat'
  | 'no-active-project'
  | 'build-failed'
  | 'preparation-failed';
export type RepositoryDeployStatus = 'idle' | 'building' | 'preparing' | 'success' | 'error';
export type DeployAlertKind = 'success' | 'error' | 'info';
export type DeployAlertStage = 'building' | 'deploying' | 'complete';
export type DeployAlertProgressStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface DeployAlertCopyState {
  type: DeployAlertKind;
  stage?: DeployAlertStage;
  buildStatus?: DeployAlertProgressStatus;
  deployStatus?: DeployAlertProgressStatus;
}

const REPOSITORY_ERROR_KEYS = {
  github: {
    'connect-first': 'deployRemaining.repository.github.connectFirst',
    'no-active-chat': 'deployRemaining.repository.noActiveChat',
    'no-active-project': 'deployRemaining.repository.noActiveProject',
    'build-failed': 'deployRemaining.repository.buildFailed',
    'preparation-failed': 'deployRemaining.repository.github.failed',
  },
  gitlab: {
    'connect-first': 'deployRemaining.repository.gitlab.connectFirst',
    'no-active-chat': 'deployRemaining.repository.noActiveChat',
    'no-active-project': 'deployRemaining.repository.noActiveProject',
    'build-failed': 'deployRemaining.repository.buildFailed',
    'preparation-failed': 'deployRemaining.repository.gitlab.failed',
  },
} as const satisfies Readonly<Record<RepositoryDeployProvider, Record<RepositoryDeployErrorCode, DeployRemainingKey>>>;

const REPOSITORY_STATUS_KEYS = {
  idle: 'deployRemaining.repository.status.idle',
  building: 'deployRemaining.repository.status.building',
  preparing: 'deployRemaining.repository.status.preparing',
  success: 'deployRemaining.repository.status.success',
  error: 'deployRemaining.repository.status.error',
} as const satisfies Readonly<Record<RepositoryDeployStatus, DeployRemainingKey>>;

export function resolveDeployRemainingLanguage(language?: string | null): DeployRemainingLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getDeployRemainingCopy(language?: string | null): DeployRemainingCopy {
  return resolveDeployRemainingLanguage(language) === 'fr' ? deployRemainingFr : deployRemainingEn;
}

export function formatDeployRemainingCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function getRepositoryDeployErrorMessage(
  language: string | null | undefined,
  provider: RepositoryDeployProvider,
  code: RepositoryDeployErrorCode,
): string {
  const copy = getDeployRemainingCopy(language);

  return copy[REPOSITORY_ERROR_KEYS[provider][code]];
}

export function getRepositoryDeployStatusMessage(
  language: string | null | undefined,
  status: RepositoryDeployStatus,
): string {
  const copy = getDeployRemainingCopy(language);

  return copy[REPOSITORY_STATUS_KEYS[status]];
}

export function getDeployAlertText(
  language: string | null | undefined,
  state: DeployAlertCopyState,
): Readonly<{ title: string; description: string }> {
  const copy = getDeployRemainingCopy(language);

  if (!state.stage) {
    const genericKeys = {
      success: {
        title: 'deployRemaining.alert.generic.successTitle',
        description: 'deployRemaining.alert.generic.successDescription',
      },
      error: {
        title: 'deployRemaining.alert.generic.errorTitle',
        description: 'deployRemaining.alert.generic.errorDescription',
      },
      info: {
        title: 'deployRemaining.alert.generic.infoTitle',
        description: 'deployRemaining.alert.generic.infoDescription',
      },
    } as const satisfies Readonly<
      Record<DeployAlertKind, Readonly<{ title: DeployRemainingKey; description: DeployRemainingKey }>>
    >;

    const keys = genericKeys[state.type];

    return { title: copy[keys.title], description: copy[keys.description] };
  }

  const titleKey =
    state.stage === 'building'
      ? 'deployRemaining.alert.buildingTitle'
      : state.stage === 'deploying'
        ? 'deployRemaining.alert.deployingTitle'
        : 'deployRemaining.alert.completedTitle';

  let descriptionKey: DeployRemainingKey;

  if (state.type === 'error') {
    descriptionKey =
      state.stage === 'building' ? 'deployRemaining.alert.buildFailed' : 'deployRemaining.alert.deploymentFailed';
  } else if (state.type === 'success' || state.stage === 'complete') {
    descriptionKey =
      state.stage === 'building' ? 'deployRemaining.alert.buildCompleted' : 'deployRemaining.alert.deploymentCompleted';
  } else {
    const progressStatus = state.stage === 'building' ? state.buildStatus : state.deployStatus;

    if (progressStatus === 'complete') {
      descriptionKey =
        state.stage === 'building'
          ? 'deployRemaining.alert.buildCompleted'
          : 'deployRemaining.alert.deploymentCompleted';
    } else if (progressStatus === 'running') {
      descriptionKey =
        state.stage === 'building' ? 'deployRemaining.alert.building' : 'deployRemaining.alert.deploying';
    } else {
      descriptionKey =
        state.stage === 'building'
          ? 'deployRemaining.alert.preparingBuild'
          : 'deployRemaining.alert.preparingDeployment';
    }
  }

  return { title: copy[titleKey], description: copy[descriptionKey] };
}
