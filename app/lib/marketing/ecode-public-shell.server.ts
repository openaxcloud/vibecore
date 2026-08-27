import {
  apiRequest,
  isApiResponse,
  json,
  readSessionToken,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getNotificationsCopy } from '~/lib/i18n/catalogs/notifications';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export type EcodeNotificationPreferences = {
  email: Record<string, boolean>;
  push: Record<string, boolean>;
  frequency: 'instant' | 'hourly' | 'daily' | 'weekly';
};

type EcodeUser = {
  id: string;
  email: string;
  name?: string | null;
  emailVerifiedAt?: string | null;
  mfaEnabled?: boolean;
  platformAdmin?: boolean;
  language?: string | null;
  timezone?: string | null;
  preferences?: Record<string, unknown> | null;
  createdAt?: string;
};

type UserPreferencesPayload = {
  language?: string | null;
  timezone?: string | null;
  preferences?: Record<string, unknown> | null;
};

const noStoreHeaders = {
  'Cache-Control': 'no-store',
};

function localizedNoStoreHeaders(request: Request) {
  const locale = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, locale);
  headers.set('Cache-Control', 'no-store');

  return { copy: getNotificationsCopy(locale.language), headers };
}

export const DEFAULT_ECODE_NOTIFICATION_PREFERENCES: EcodeNotificationPreferences = {
  email: {
    agent: true,
    comments: true,
    deployments: true,
    follows: true,
    likes: true,
    marketing: false,
    mentions: true,
    security: true,
    teamUpdates: true,
  },
  push: {
    agent: true,
    comments: true,
    deployments: true,
    follows: true,
    likes: true,
    mentions: true,
    security: true,
    teamUpdates: true,
  },
  frequency: 'instant',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanMap(value: unknown, fallback: Record<string, boolean>) {
  if (!isObject(value)) {
    return fallback;
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
    .map(([key, enabled]) => [key, enabled] as const);

  return { ...fallback, ...Object.fromEntries(entries) };
}

export function normalizeEcodeNotificationPreferences(input: unknown): EcodeNotificationPreferences {
  if (!isObject(input)) {
    return DEFAULT_ECODE_NOTIFICATION_PREFERENCES;
  }

  const frequency = input.frequency;

  return {
    email: booleanMap(input.email, DEFAULT_ECODE_NOTIFICATION_PREFERENCES.email),
    push: booleanMap(input.push, DEFAULT_ECODE_NOTIFICATION_PREFERENCES.push),
    frequency:
      frequency === 'instant' || frequency === 'hourly' || frequency === 'daily' || frequency === 'weekly'
        ? frequency
        : DEFAULT_ECODE_NOTIFICATION_PREFERENCES.frequency,
  };
}

function emailHandle(email: string) {
  return email.split('@')[0]?.replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
}

function mapEcodeUserToEcodeUser(user: EcodeUser) {
  const username = emailHandle(user.email);
  const displayName = user.name || username;

  return {
    id: user.id,
    email: user.email,
    username,
    name: user.name ?? displayName,
    displayName,
    avatarUrl: null,
    emailVerified: Boolean(user.emailVerifiedAt),
    mfaEnabled: Boolean(user.mfaEnabled),
    platformAdmin: Boolean(user.platformAdmin),
    language: user.language ?? null,
    timezone: user.timezone ?? null,
    preferences: user.preferences ?? {},
    createdAt: user.createdAt ?? null,
  };
}

export async function ecodeMeLoader({ request }: EnterpriseLoaderArgs) {
  if (!readSessionToken(request)) {
    return json(null, { headers: noStoreHeaders });
  }

  try {
    const payload = await apiRequest<{ user?: EcodeUser }>(request, '/auth/me', { redirectOn401: false });

    return json(payload.user ? mapEcodeUserToEcodeUser(payload.user) : null, { headers: noStoreHeaders });
  } catch (error) {
    if (isApiResponse(error, 401)) {
      return json(null, { headers: noStoreHeaders });
    }

    throw error;
  }
}

async function readUserPreferences(request: Request) {
  if (!readSessionToken(request)) {
    return undefined;
  }

  try {
    return await apiRequest<UserPreferencesPayload>(request, '/user/preferences', { redirectOn401: false });
  } catch (error) {
    if (isApiResponse(error, 401)) {
      return undefined;
    }

    throw error;
  }
}

export async function ecodeNotificationPreferencesLoader({ request }: EnterpriseLoaderArgs) {
  const payload = await readUserPreferences(request);

  return json(normalizeEcodeNotificationPreferences(payload?.preferences?.notifications), { headers: noStoreHeaders });
}

export async function readJsonObject(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    return isObject(payload) ? payload : {};
  } catch {
    return {};
  }
}

export async function ecodeNotificationPreferencesAction({ request }: EnterpriseActionArgs) {
  const { copy, headers } = localizedNoStoreHeaders(request);

  if (request.method !== 'PATCH' && request.method !== 'PUT') {
    return json({ ok: false, error: copy['notifications.api.methodNotAllowed'] }, { status: 405, headers });
  }

  if (!readSessionToken(request)) {
    return json({ ok: false, error: copy['notifications.api.authenticationRequired'] }, { status: 401, headers });
  }

  const preferences = normalizeEcodeNotificationPreferences(await readJsonObject(request));

  const payload = await apiRequest<UserPreferencesPayload>(request, '/user/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences: { notifications: preferences } }),
    redirectOn401: false,
  });

  return json(normalizeEcodeNotificationPreferences(payload.preferences?.notifications), { headers });
}

/**
 * One in-app notification as surfaced to the SaaS account feed. Mirrors the
 * `publicNotification` shape returned by the API `/user/notifications` routes.
 */
export type EcodeNotification = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export type EcodeNotificationFeed = {
  notifications: EcodeNotification[];
  unreadCount: number;
};

type NotificationFeedPayload = {
  notifications?: unknown;
  unreadCount?: unknown;
};

function normalizeNotification(input: unknown): EcodeNotification | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.createdAt !== 'string') {
    return null;
  }

  return {
    id: raw.id,
    category: typeof raw.category === 'string' ? raw.category : 'system',
    title: raw.title,
    body: typeof raw.body === 'string' ? raw.body : null,
    linkUrl: typeof raw.linkUrl === 'string' ? raw.linkUrl : null,
    read: raw.read === true,
    readAt: typeof raw.readAt === 'string' ? raw.readAt : null,
    createdAt: raw.createdAt,
  };
}

function normalizeNotificationFeed(payload: NotificationFeedPayload | undefined): EcodeNotificationFeed {
  const notifications = Array.isArray(payload?.notifications)
    ? payload!.notifications.map(normalizeNotification).filter((n): n is EcodeNotification => n !== null)
    : [];
  const unreadCount =
    typeof payload?.unreadCount === 'number' && Number.isFinite(payload.unreadCount)
      ? payload.unreadCount
      : notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount };
}

/**
 * Loads the current user's in-app notification feed (unread first, newest
 * next) with the unread count for the badge. Anonymous visitors receive the
 * stable empty shape, while authenticated failures carry an explicit flag so
 * the user area can render an honest, retryable error state without causing a
 * browser-level failed-resource error.
 */
export async function notificationFeedLoader({ request }: EnterpriseLoaderArgs) {
  if (!readSessionToken(request)) {
    return json(normalizeNotificationFeed(undefined), { headers: noStoreHeaders });
  }

  try {
    const payload = await apiRequest<NotificationFeedPayload>(request, '/user/notifications', {
      redirectOn401: false,
    });
    return json(normalizeNotificationFeed(payload), { headers: noStoreHeaders });
  } catch (error) {
    return json(
      {
        ...normalizeNotificationFeed(undefined),
        unavailable: true,
        status: isApiResponse(error) ? error.status : 503,
      },
      { headers: noStoreHeaders },
    );
  }
}

export async function notificationsCollectionAction({ request }: EnterpriseActionArgs) {
  const { copy, headers } = localizedNoStoreHeaders(request);

  // POST (or legacy DELETE) marks the whole feed read; anything else is rejected.
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ ok: false, error: copy['notifications.api.methodNotAllowed'] }, { status: 405, headers });
  }

  const payload = await apiRequest<{ marked?: number; unreadCount?: number }>(request, '/user/notifications/read-all', {
    method: 'POST',
  });

  return json(
    { ok: true, marked: payload.marked ?? 0, unreadCount: payload.unreadCount ?? 0 },
    {
      headers,
    },
  );
}

export async function notificationMutationAction({ request, params }: EnterpriseActionArgs) {
  const { copy, headers } = localizedNoStoreHeaders(request);

  // POST/PATCH mark a single notification read; the id comes from the route.
  if (request.method !== 'POST' && request.method !== 'PATCH') {
    return json({ ok: false, error: copy['notifications.api.methodNotAllowed'] }, { status: 405, headers });
  }

  const notificationId = params.notificationId;

  if (!notificationId) {
    return json({ ok: false, error: copy['notifications.api.missingNotificationId'] }, { status: 400, headers });
  }

  const payload = await apiRequest<{ unreadCount?: number }>(
    request,
    `/user/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST' },
  );

  return json({ ok: true, unreadCount: payload.unreadCount ?? 0 }, { headers });
}
