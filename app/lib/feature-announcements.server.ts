import type { Feature } from '~/lib/api/features';
import {
  defaultFeatureAnnouncements,
  normalizeFeatureAnnouncementLanguage,
  type FeatureAnnouncementConfig,
  type FeatureAnnouncementLanguage,
} from '~/lib/i18n/catalogs/feature-announcements';

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

type LocalizedText = string | Readonly<Partial<Record<FeatureAnnouncementLanguage, string>>>;
type AnnouncementOverride = Omit<FeatureAnnouncementConfig, 'description' | 'name'> & {
  name: LocalizedText;
  description: LocalizedText;
};

type RuntimeProcess = { env?: Record<string, string | undefined> };

function envValue(key: string): string | undefined {
  const maybeProcess = (globalThis as typeof globalThis & { process?: RuntimeProcess }).process;
  return maybeProcess?.env?.[key];
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return ['en', 'fr'].some(
    (language) => typeof candidate[language] === 'string' && candidate[language].trim().length > 0,
  );
}

function isAnnouncement(value: unknown): value is AnnouncementOverride {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    isLocalizedText(candidate.name) &&
    isLocalizedText(candidate.description) &&
    typeof candidate.releaseDate === 'string'
  );
}

function localizeOverrideText(value: LocalizedText, language: FeatureAnnouncementLanguage): string {
  if (typeof value === 'string') {
    return value;
  }

  return value[language]?.trim() || value.en?.trim() || value.fr?.trim() || '';
}

/** Returns the announcement catalog, preferring a valid FEATURE_ANNOUNCEMENTS override. */
export function getFeatureAnnouncements(language?: string | null): FeatureAnnouncementConfig[] {
  const resolvedLanguage = normalizeFeatureAnnouncementLanguage(language);
  const raw = envValue('FEATURE_ANNOUNCEMENTS');

  if (raw && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed) && parsed.every(isAnnouncement)) {
        return parsed.map((announcement) => ({
          id: announcement.id,
          name: localizeOverrideText(announcement.name, resolvedLanguage),
          description: localizeOverrideText(announcement.description, resolvedLanguage),
          releaseDate: announcement.releaseDate,
        }));
      }

      console.error({ code: 'FEATURE_ANNOUNCEMENTS_INVALID' });
    } catch (error) {
      console.error({ code: 'FEATURE_ANNOUNCEMENTS_PARSE_FAILED', error });
    }
  }

  return defaultFeatureAnnouncements(resolvedLanguage);
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
export function getFeaturesForRequest(request: Request, language?: string | null): Feature[] {
  const viewed = new Set(readViewedFeatureIds(request));

  return getFeatureAnnouncements(language).map((announcement) => ({
    ...announcement,
    viewed: viewed.has(announcement.id),
  }));
}
