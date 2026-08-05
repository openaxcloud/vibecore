import type { ConnectorErrorCode } from '@vibecore/connector-sdk';
import type { FastifyReply, FastifyRequest } from 'fastify';

type ConnectorProxyLanguage = 'en' | 'fr';
type ConnectorProxyCopy = Readonly<Record<ConnectorErrorCode, string>>;

export const connectorProxyEn: ConnectorProxyCopy = {
  CONNECTOR_TOKEN_MISSING: 'A connector access token is required.',
  CONNECTOR_TOKEN_INVALID: 'The connector access token is invalid.',
  CONNECTOR_TOKEN_EXPIRED: 'The connector access token has expired. Reconnect the service and try again.',
  CONNECTOR_LINK_MISSING: 'This project is not linked to the requested connection.',
  CONNECTOR_POLICY_DENIED: 'Your organization does not allow this connector operation.',
  CONNECTOR_RATE_LIMITED: 'Too many connector requests were sent. Please wait before trying again.',
  CONNECTOR_PROVIDER_AUTH_FAILED: 'The provider connection is no longer valid. Reconnect it and try again.',
  CONNECTOR_PROVIDER_UNREACHABLE: 'The connector provider is temporarily unavailable. Please try again.',
  CONNECTOR_UNKNOWN_PROVIDER: 'This connector provider is not supported.',
  CONNECTOR_NEEDS_RECONNECT: 'Reconnect this provider before continuing.',
  CONNECTOR_INVALID_PATH: 'The connector request path is invalid.',
  CONNECTOR_PATH_TRAVERSAL: 'The connector request path is not allowed.',
};

export const connectorProxyFr: ConnectorProxyCopy = {
  CONNECTOR_TOKEN_MISSING: 'Un jeton d’accès au connecteur est obligatoire.',
  CONNECTOR_TOKEN_INVALID: 'Le jeton d’accès au connecteur est invalide.',
  CONNECTOR_TOKEN_EXPIRED: 'Le jeton d’accès au connecteur a expiré. Reconnectez le service, puis réessayez.',
  CONNECTOR_LINK_MISSING: 'Ce projet n’est pas lié à la connexion demandée.',
  CONNECTOR_POLICY_DENIED: 'Votre organisation n’autorise pas cette opération du connecteur.',
  CONNECTOR_RATE_LIMITED: 'Trop de requêtes ont été envoyées au connecteur. Veuillez patienter avant de réessayer.',
  CONNECTOR_PROVIDER_AUTH_FAILED: 'La connexion au fournisseur n’est plus valide. Reconnectez-la, puis réessayez.',
  CONNECTOR_PROVIDER_UNREACHABLE: 'Le fournisseur du connecteur est temporairement indisponible. Veuillez réessayer.',
  CONNECTOR_UNKNOWN_PROVIDER: 'Ce fournisseur de connecteur n’est pas pris en charge.',
  CONNECTOR_NEEDS_RECONNECT: 'Reconnectez ce fournisseur pour continuer.',
  CONNECTOR_INVALID_PATH: 'Le chemin de la requête du connecteur est invalide.',
  CONNECTOR_PATH_TRAVERSAL: 'Le chemin de la requête du connecteur n’est pas autorisé.',
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

function supportedLanguage(value: string | undefined): ConnectorProxyLanguage | undefined {
  const primary = value?.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'en' || primary === 'fr' ? primary : undefined;
}

function acceptedLanguage(value: string | undefined): ConnectorProxyLanguage | undefined {
  return value
    ?.split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const rawQuality = parameters
        .find((parameter) => parameter.trim().startsWith('q='))
        ?.trim()
        .slice(2);
      const quality = rawQuality === undefined ? 1 : Number.parseFloat(rawQuality);
      return { language: supportedLanguage(tag), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(
      (entry): entry is { language: ConnectorProxyLanguage; quality: number; index: number } =>
        entry.language !== undefined && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0]?.language;
}

export function resolveConnectorProxyLanguage(headers: FastifyRequest['headers']): ConnectorProxyLanguage {
  const cookieHeader = typeof headers.cookie === 'string' ? headers.cookie : undefined;
  const manual = supportedLanguage(cookieValue(cookieHeader, 'vibecore-lang'));

  if (manual) {
    return manual;
  }

  const automatic = supportedLanguage(cookieValue(cookieHeader, 'vibecore-auto-lang'));

  if (automatic) {
    return automatic;
  }

  const accept = typeof headers['accept-language'] === 'string' ? headers['accept-language'] : undefined;
  return acceptedLanguage(accept) ?? 'en';
}

export function sendConnectorProxyError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: ConnectorErrorCode,
): unknown {
  const language = resolveConnectorProxyLanguage(request.headers);
  const copy = language === 'fr' ? connectorProxyFr : connectorProxyEn;
  reply.header('content-language', language);
  reply.header('vary', 'Cookie, Accept-Language');
  return reply.code(status).send({ error: copy[code], code });
}
