import {
  apiRequest,
  isApiResponse,
  json,
  readSessionToken,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export type EcodeNotificationPreferences = {
  email: Record<string, boolean>;
  push: Record<string, boolean>;
  frequency: 'instant' | 'hourly' | 'daily' | 'weekly';
};

type VibecoreUser = {
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

function mapVibecoreUserToEcodeUser(user: VibecoreUser) {
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
    const payload = await apiRequest<{ user?: VibecoreUser }>(request, '/auth/me', { redirectOn401: false });

    return json(payload.user ? mapVibecoreUserToEcodeUser(payload.user) : null, { headers: noStoreHeaders });
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

async function readJsonObject(request: Request) {
  if ((request.headers.get('content-length') ?? '0') === '0') {
    return {};
  }

  try {
    const payload = (await request.json()) as unknown;

    return isObject(payload) ? payload : {};
  } catch {
    return {};
  }
}

export async function ecodeNotificationPreferencesAction({ request }: EnterpriseActionArgs) {
  if (request.method !== 'PATCH' && request.method !== 'PUT') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: noStoreHeaders });
  }

  if (!readSessionToken(request)) {
    return json({ ok: false, error: 'Authentication required' }, { status: 401, headers: noStoreHeaders });
  }

  const preferences = normalizeEcodeNotificationPreferences(await readJsonObject(request));

  const payload = await apiRequest<UserPreferencesPayload>(request, '/user/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences: { notifications: preferences } }),
    redirectOn401: false,
  });

  return json(normalizeEcodeNotificationPreferences(payload.preferences?.notifications), { headers: noStoreHeaders });
}

export function emptyNotificationsLoader() {
  return json([], { headers: noStoreHeaders });
}

export async function notificationsCollectionAction({ request }: EnterpriseActionArgs) {
  if (request.method !== 'DELETE') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: noStoreHeaders });
  }

  return json({ ok: true, cleared: 0 }, { headers: noStoreHeaders });
}

export async function notificationMutationAction({ request }: EnterpriseActionArgs) {
  if (request.method !== 'DELETE' && request.method !== 'PATCH') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: noStoreHeaders });
  }

  return json({ ok: true }, { headers: noStoreHeaders });
}
