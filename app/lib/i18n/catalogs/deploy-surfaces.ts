import { resolveMarketingLanguage } from './marketing';

export const deploySurfacesEn = {
  'deploySurfaces.common.noActiveChat': 'No active chat was found.',
  'deploySurfaces.common.noActiveProject': 'No active project is available to deploy.',
  'deploySurfaces.common.buildFailed':
    'The project build failed. Review the terminal output, fix the errors, and try again.',
  'deploySurfaces.common.outputDirectoryMissing':
    'The build output directory could not be found. Check the build configuration and try again.',
  'deploySurfaces.common.invalidResponse': 'The deployment service returned an unexpected response. Please try again.',
  'deploySurfaces.status.idle': 'Ready to deploy.',
  'deploySurfaces.status.building': 'Building the project…',
  'deploySurfaces.status.deploying': 'Deploying the project…',
  'deploySurfaces.status.pending': 'The deployment is still in progress.',
  'deploySurfaces.status.success': 'Deployment completed successfully.',
  'deploySurfaces.status.error': 'The deployment could not be completed.',
  'deploySurfaces.netlify.connectFirst': 'Connect your Netlify account in Settings before deploying.',
  'deploySurfaces.netlify.artifactTitle': 'Netlify deployment',
  'deploySurfaces.netlify.statusCheckFailed':
    'The Netlify deployment status could not be confirmed. Check the Netlify dashboard, then try again.',
  'deploySurfaces.netlify.timedOut': 'The Netlify deployment timed out. Check its status in the Netlify dashboard.',
  'deploySurfaces.netlify.failed': 'The Netlify deployment failed. Try again or check the Netlify dashboard.',
  'deploySurfaces.netlify.success': '🚀 Netlify deployment completed successfully.',
  'deploySurfaces.vercel.connectFirst': 'Connect your Vercel account in Settings before deploying.',
  'deploySurfaces.vercel.artifactTitle': 'Vercel deployment',
  'deploySurfaces.vercel.pending':
    'Your Vercel deployment is still in progress. Check the Vercel dashboard for the final status.',
  'deploySurfaces.vercel.failed': 'The Vercel deployment failed. Try again or check the Vercel dashboard.',
  'deploySurfaces.vercel.success': '🚀 Vercel deployment completed successfully.',
} as const;

export type DeploySurfacesKey = keyof typeof deploySurfacesEn;
export type DeploySurfacesCopy = Readonly<Record<DeploySurfacesKey, string>>;

export const deploySurfacesFr: DeploySurfacesCopy = {
  'deploySurfaces.common.noActiveChat': 'Aucune conversation active n’a été trouvée.',
  'deploySurfaces.common.noActiveProject': 'Aucun projet actif n’est disponible pour le déploiement.',
  'deploySurfaces.common.buildFailed':
    'La compilation du projet a échoué. Consultez la sortie du terminal, corrigez les erreurs, puis réessayez.',
  'deploySurfaces.common.outputDirectoryMissing':
    'Le dossier de sortie de la compilation est introuvable. Vérifiez la configuration, puis réessayez.',
  'deploySurfaces.common.invalidResponse':
    'Le service de déploiement a renvoyé une réponse inattendue. Veuillez réessayer.',
  'deploySurfaces.status.idle': 'Prêt pour le déploiement.',
  'deploySurfaces.status.building': 'Compilation du projet…',
  'deploySurfaces.status.deploying': 'Déploiement du projet…',
  'deploySurfaces.status.pending': 'Le déploiement est toujours en cours.',
  'deploySurfaces.status.success': 'Déploiement terminé avec succès.',
  'deploySurfaces.status.error': 'Le déploiement n’a pas pu être terminé.',
  'deploySurfaces.netlify.connectFirst':
    'Connectez votre compte Netlify dans les paramètres avant de lancer le déploiement.',
  'deploySurfaces.netlify.artifactTitle': 'Déploiement Netlify',
  'deploySurfaces.netlify.statusCheckFailed':
    'Impossible de confirmer l’état du déploiement Netlify. Consultez le tableau de bord Netlify, puis réessayez.',
  'deploySurfaces.netlify.timedOut':
    'Le délai d’attente du déploiement Netlify est dépassé. Consultez son état dans le tableau de bord Netlify.',
  'deploySurfaces.netlify.failed':
    'Le déploiement Netlify a échoué. Réessayez ou consultez le tableau de bord Netlify.',
  'deploySurfaces.netlify.success': '🚀 Déploiement Netlify terminé avec succès.',
  'deploySurfaces.vercel.connectFirst':
    'Connectez votre compte Vercel dans les paramètres avant de lancer le déploiement.',
  'deploySurfaces.vercel.artifactTitle': 'Déploiement Vercel',
  'deploySurfaces.vercel.pending':
    'Votre déploiement Vercel est toujours en cours. Consultez le tableau de bord Vercel pour connaître son état final.',
  'deploySurfaces.vercel.failed': 'Le déploiement Vercel a échoué. Réessayez ou consultez le tableau de bord Vercel.',
  'deploySurfaces.vercel.success': '🚀 Déploiement Vercel terminé avec succès.',
};

export type DeploySurfaceStatus = 'idle' | 'building' | 'deploying' | 'pending' | 'success' | 'error';

const STATUS_COPY_KEYS = {
  idle: 'deploySurfaces.status.idle',
  building: 'deploySurfaces.status.building',
  deploying: 'deploySurfaces.status.deploying',
  pending: 'deploySurfaces.status.pending',
  success: 'deploySurfaces.status.success',
  error: 'deploySurfaces.status.error',
} as const satisfies Readonly<Record<DeploySurfaceStatus, DeploySurfacesKey>>;

export function getDeploySurfacesCopy(language?: string | null): DeploySurfacesCopy {
  return resolveMarketingLanguage(language) === 'fr' ? deploySurfacesFr : deploySurfacesEn;
}

export function getDeploySurfaceStatusCopy(copy: DeploySurfacesCopy, status: DeploySurfaceStatus): string {
  return copy[STATUS_COPY_KEYS[status]];
}
