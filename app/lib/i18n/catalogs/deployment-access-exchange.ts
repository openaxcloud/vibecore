export const deploymentAccessExchangeCopy = {
  en: {
    invalidDeployment: 'Invalid deployment.',
    exchangeUnavailable: 'Deployment access exchange unavailable.',
    title: 'Opening secure deployment…',
    body: 'Your identity was verified. We are completing a short-lived session on the deployment.',
    button: 'Continue to deployment',
  },
  fr: {
    invalidDeployment: 'Déploiement invalide.',
    exchangeUnavailable: 'L’échange d’accès au déploiement est indisponible.',
    title: 'Ouverture du déploiement sécurisé…',
    body: 'Votre identité a été vérifiée. Nous finalisons une session courte sur le déploiement.',
    button: 'Continuer vers le déploiement',
  },
} as const;

export type DeploymentAccessExchangeLanguage = keyof typeof deploymentAccessExchangeCopy;
