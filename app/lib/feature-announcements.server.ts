import type { Feature } from '~/lib/api/features';

/*
 * Source of truth for the "what's new" announcements surfaced by the
 * `useFeatures` hook (the bell badge in the header). The backend FeatureFlag
 * model is an admin-only boolean rollout control with no name/description/
 * releaseDate — a different concept from these user-facing announcements — so
 * the catalog lives here as product content and can be overridden per
 * environment via the FEATURE_ANNOUNCEMENTS env var (a JSON array of
 * { id, name, description, releaseDate }).
 *
 * Per-user "viewed" state is tracked in the `vc_viewed_features` cookie: the
 * loader marks each announcement viewed when its id is present, and the
 * `viewed` action appends the id. The client `useFeatures` hook additionally
 * mirrors this in localStorage, so the two stay consistent across reloads.
 */

const VIEWED_COOKIE = 'vc_viewed_features';
const VIEWED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type AnnouncementConfig = Omit<Feature, 'viewed'>;

const DEFAULT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    id: 'mcp-marketplace',
    name: 'MCP marketplace',
    description: 'Browse and connect Model Context Protocol servers to give the agent new tools.',
    releaseDate: '2026-05-05',
  },
  {
    id: 'static-deployments',
    name: 'Static deployments',
    description: 'Ship static builds straight from the workspace with a shareable preview URL.',
    releaseDate: '2026-05-15',
  },
  {
    id: 'agent-panel',
    name: 'Collaborative agent panel',
    description: 'Review, accept and undo agent edits inline with live presence and share links.',
    releaseDate: '2026-05-19',
  },
];

type RuntimeProcess = { env?: Record<string, string | undefined> };

function envValue(key: string): string | undefined {
  const maybeProcess = (globalThis as typeof globalThis & { process?: RuntimeProcess }).process;
  return maybeProcess?.env?.[key];
}

function isAnnouncement(value: unknown): value is AnnouncementConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.releaseDate === 'string'
  );
}

/** Returns the announcement catalog, preferring a valid FEATURE_ANNOUNCEMENTS override. */
export function getFeatureAnnouncements(): AnnouncementConfig[] {
  const raw = envValue('FEATURE_ANNOUNCEMENTS');

  if (raw && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed) && parsed.every(isAnnouncement)) {
        return parsed;
      }

      console.error('FEATURE_ANNOUNCEMENTS is not a valid Feature[] — falling back to defaults');
    } catch (error) {
      console.error('Failed to parse FEATURE_ANNOUNCEMENTS env var:', error);
    }
  }

  return DEFAULT_ANNOUNCEMENTS;
}

/** Parses the set of viewed feature ids from the request's cookie header. */
export function readViewedFeatureIds(request: Request): string[] {
  const cookie = request.headers.get('cookie') ?? '';

  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${VIEWED_COOKIE}=`));

  if (!match) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(VIEWED_COOKIE.length + 1)));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Builds a Set-Cookie value persisting the given viewed feature ids. */
export function viewedFeaturesCookie(ids: string[]): string {
  const value = encodeURIComponent(JSON.stringify(ids));
  const secure = envValue('NODE_ENV') === 'production' ? '; Secure' : '';

  return `${VIEWED_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=${VIEWED_COOKIE_MAX_AGE}${secure}`;
}

/** Returns the announcement catalog with per-request `viewed` state applied. */
export function getFeaturesForRequest(request: Request): Feature[] {
  const viewed = new Set(readViewedFeatureIds(request));

  return getFeatureAnnouncements().map((announcement) => ({
    ...announcement,
    viewed: viewed.has(announcement.id),
  }));
}
