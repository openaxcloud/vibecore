import type { FastifyReply, FastifyRequest } from 'fastify';

export type PreviewProxyLanguage = 'en' | 'fr';

export const previewProxyEn = {
  STATIC_DEPLOY_UPSTREAM_INVALID: 'The static deployment service is misconfigured.',
  STATIC_DEPLOY_PATH_INVALID: 'The static deployment path is invalid.',
  STATIC_DEPLOY_UPSTREAM_TIMEOUT: 'The static deployment service timed out.',
  STATIC_DEPLOY_UPSTREAM_FAILED: 'The static deployment service is unavailable. Please try again.',
  SERVER_DEPLOY_UPSTREAM_INVALID: 'The server deployment service is misconfigured.',
  SERVER_DEPLOY_PATH_INVALID: 'The server deployment path is invalid.',
  SERVER_DEPLOY_UPSTREAM_TIMEOUT: 'The deployment service timed out.',
  SERVER_DEPLOY_NOT_LIVE: 'This deployment is not live because its last publish failed or it was deleted.',
  RESERVED_VM_SUSPENDED: 'This Reserved VM is suspended until its billing issue is resolved.',
  SERVER_DEPLOY_UPSTREAM_ERROR: 'The deployment service is unavailable. Please try again.',
  PUBLISHED_DEPLOYMENT_EXPIRED:
    'This publication has expired. Publish the project again to bring its address back online.',
  PUBLICATION_STATE_UNAVAILABLE: 'This publication’s state could not be verified. Please try again in a moment.',
  PUBLISH_BADGE_LABEL: 'Built with E-Code',
  publishedFrameTitle: 'Published application',
  publishedFrameLoading: 'Loading the published application…',
  publishedFrameError: 'The published application is taking longer than expected to load.',
  publishedFrameRetry: 'Retry',
  PREVIEW_PORT_INVALID: 'The preview port is invalid.',
  PREVIEW_TENANT_FORBIDDEN: 'You do not have access to this preview.',
  PREVIEW_AGENT_NOT_FOUND: 'The workspace preview is not reachable yet. Please try again.',
  PREVIEW_PATH_INVALID: 'The preview path is invalid.',
  PREVIEW_UPSTREAM_TIMEOUT: 'The preview service timed out.',
  PREVIEW_UPSTREAM_ERROR: 'The preview service is unavailable. Please try again.',
  startingTitle: 'Starting your app…',
  startingBody: 'The development server is starting. This page refreshes automatically.',
  deploymentNotLiveTitle: 'This deployment is not live',
  deploymentNotLiveBody:
    'Its last publish failed or it was deleted. Publish the project again to bring it back online.',
  reservedVmSuspendedTitle: 'This Reserved VM is suspended',
  reservedVmSuspendedBody:
    'Open deployment settings, resolve billing, then explicitly resume this Reserved VM. Public traffic cannot restart it.',
  privatePortTitle: 'This port is private',
  privatePortBody: 'Sign in to the workspace owner’s account to view this preview.',
} as const;

export type PreviewProxyCopyKey = keyof typeof previewProxyEn;
export type PreviewProxyErrorCode = Exclude<
  PreviewProxyCopyKey,
  | 'startingTitle'
  | 'startingBody'
  | 'deploymentNotLiveTitle'
  | 'deploymentNotLiveBody'
  | 'reservedVmSuspendedTitle'
  | 'reservedVmSuspendedBody'
  | 'privatePortTitle'
  | 'privatePortBody'
  | 'PUBLISH_BADGE_LABEL'
  | 'publishedFrameTitle'
  | 'publishedFrameLoading'
  | 'publishedFrameError'
  | 'publishedFrameRetry'
>;
export type PreviewProxyCopy = Readonly<Record<PreviewProxyCopyKey, string>>;

export const previewProxyFr: PreviewProxyCopy = {
  STATIC_DEPLOY_UPSTREAM_INVALID: 'Le service de déploiement statique est mal configuré.',
  STATIC_DEPLOY_PATH_INVALID: 'Le chemin du déploiement statique est invalide.',
  STATIC_DEPLOY_UPSTREAM_TIMEOUT: 'Le délai du service de déploiement statique a expiré.',
  STATIC_DEPLOY_UPSTREAM_FAILED: 'Le service de déploiement statique est indisponible. Veuillez réessayer.',
  SERVER_DEPLOY_UPSTREAM_INVALID: 'Le service de déploiement serveur est mal configuré.',
  SERVER_DEPLOY_PATH_INVALID: 'Le chemin du déploiement serveur est invalide.',
  SERVER_DEPLOY_UPSTREAM_TIMEOUT: 'Le délai du service de déploiement a expiré.',
  SERVER_DEPLOY_NOT_LIVE:
    'Ce déploiement n’est pas en ligne, car sa dernière publication a échoué ou il a été supprimé.',
  RESERVED_VM_SUSPENDED: 'Cette VM réservée est suspendue jusqu’à la résolution du problème de facturation.',
  SERVER_DEPLOY_UPSTREAM_ERROR: 'Le service de déploiement est indisponible. Veuillez réessayer.',
  PUBLISHED_DEPLOYMENT_EXPIRED: 'Cette publication a expiré. Republiez le projet pour remettre l’adresse en ligne.',
  PUBLICATION_STATE_UNAVAILABLE: 'Impossible de vérifier l’état de cette publication. Réessayez dans un instant.',
  PUBLISH_BADGE_LABEL: 'Créé avec E-Code',
  publishedFrameTitle: 'Application publiée',
  publishedFrameLoading: 'Chargement de l’application publiée…',
  publishedFrameError: 'Le chargement de l’application publiée prend plus de temps que prévu.',
  publishedFrameRetry: 'Réessayer',
  PREVIEW_PORT_INVALID: 'Le port d’aperçu est invalide.',
  PREVIEW_TENANT_FORBIDDEN: 'Vous n’avez pas accès à cet aperçu.',
  PREVIEW_AGENT_NOT_FOUND: 'L’aperçu de l’espace de travail est encore inaccessible. Veuillez réessayer.',
  PREVIEW_PATH_INVALID: 'Le chemin d’aperçu est invalide.',
  PREVIEW_UPSTREAM_TIMEOUT: 'Le délai du service d’aperçu a expiré.',
  PREVIEW_UPSTREAM_ERROR: 'Le service d’aperçu est indisponible. Veuillez réessayer.',
  startingTitle: 'Démarrage de votre application…',
  startingBody: 'Le serveur de développement démarre. Cette page s’actualise automatiquement.',
  deploymentNotLiveTitle: 'Ce déploiement n’est pas en ligne',
  deploymentNotLiveBody:
    'Sa dernière publication a échoué ou il a été supprimé. Publiez de nouveau le projet pour le remettre en ligne.',
  reservedVmSuspendedTitle: 'Cette VM réservée est suspendue',
  reservedVmSuspendedBody:
    'Ouvrez les paramètres de déploiement, réglez la facturation, puis reprenez explicitement cette VM réservée. Le trafic public ne peut pas la redémarrer.',
  privatePortTitle: 'Ce port est privé',
  privatePortBody: 'Connectez-vous au compte du propriétaire de l’espace de travail pour afficher cet aperçu.',
};

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  for (const segment of cookieHeader?.split(';') ?? []) {
    const [rawName, ...rawValue] = segment.trim().split('=');

    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return rawValue.join('=');
    }
  }

  return undefined;
}

function supportedLanguage(value: string | undefined): PreviewProxyLanguage | undefined {
  const primary = value?.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'en' || primary === 'fr' ? primary : undefined;
}

function acceptLanguage(value: string | undefined): PreviewProxyLanguage | undefined {
  return value
    ?.split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityRaw = parameters
        .find((parameter) => parameter.trim().startsWith('q='))
        ?.trim()
        .slice(2);
      const quality = qualityRaw === undefined ? 1 : Number.parseFloat(qualityRaw);
      return { language: supportedLanguage(tag), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(
      (entry): entry is { language: PreviewProxyLanguage; quality: number; index: number } =>
        entry.language !== undefined && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0]?.language;
}

export function resolvePreviewProxyLanguage(headers: FastifyRequest['headers']): PreviewProxyLanguage {
  const cookieHeader = typeof headers.cookie === 'string' ? headers.cookie : undefined;
  const manual = supportedLanguage(cookieValue(cookieHeader, 'vibecore-lang'));

  if (manual) {
    return manual;
  }

  const automatic = supportedLanguage(cookieValue(cookieHeader, 'vibecore-auto-lang'));

  if (automatic) {
    return automatic;
  }

  const accepted = typeof headers['accept-language'] === 'string' ? headers['accept-language'] : undefined;
  return acceptLanguage(accepted) ?? 'en';
}

export function getPreviewProxyCopy(headers: FastifyRequest['headers']): PreviewProxyCopy {
  return resolvePreviewProxyLanguage(headers) === 'fr' ? previewProxyFr : previewProxyEn;
}

export function applyPreviewProxyLocale(reply: FastifyReply, request: FastifyRequest): PreviewProxyLanguage {
  const language = resolvePreviewProxyLanguage(request.headers);
  reply.header('content-language', language);
  reply.header('vary', 'Cookie, Accept-Language');
  return language;
}

export function sendPreviewProxyError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: PreviewProxyErrorCode,
): unknown {
  const copy = getPreviewProxyCopy(request.headers);
  applyPreviewProxyLocale(reply, request);
  return reply.code(status).send({ error: copy[code], code });
}

type PreviewHtmlKind = 'starting' | 'deployment-not-live' | 'reserved-vm-suspended' | 'private-port';

export function previewProxyHtml(request: FastifyRequest, kind: PreviewHtmlKind): string {
  const language = resolvePreviewProxyLanguage(request.headers);
  const copy = language === 'fr' ? previewProxyFr : previewProxyEn;
  const isStarting = kind === 'starting';
  const title = isStarting
    ? copy.startingTitle
    : kind === 'deployment-not-live'
      ? copy.deploymentNotLiveTitle
      : kind === 'reserved-vm-suspended'
        ? copy.reservedVmSuspendedTitle
        : copy.privatePortTitle;
  const body = isStarting
    ? copy.startingBody
    : kind === 'deployment-not-live'
      ? copy.deploymentNotLiveBody
      : kind === 'reserved-vm-suspended'
        ? copy.reservedVmSuspendedBody
        : copy.privatePortBody;
  const refresh = isStarting ? '<meta http-equiv="refresh" content="2">' : '';
  const indicator = isStarting
    ? '<div class="s"></div>'
    : kind === 'deployment-not-live'
      ? '<div class="i"></div>'
      : '';

  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8">${refresh}<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9}.box{text-align:center;max-width:440px;padding:24px}.s{width:28px;height:28px;border:3px solid #30363d;border-top-color:#F26207;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.i{width:28px;height:28px;border:3px solid #30363d;border-radius:50%;margin:0 auto 16px;position:relative}.i:after{content:"";position:absolute;inset:6px;border-radius:50%;background:#f85149}h1{font-size:16px;font-weight:600;margin:0 0 8px}p{font-size:13px;color:#8b949e;margin:0}</style></head><body><div class="box">${indicator}<h1>${title}</h1><p>${body}</p></div></body></html>`;
}
