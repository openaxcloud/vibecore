import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { translateServerMessage } from '~/lib/i18n/server';

/*
 * BD-06: the @settings ProfileTab used to persist username/bio/avatar to
 * localStorage only, masquerading as account state. This proxy backs it with
 * the real account:
 *   - `username` ↔ the account `name` (first-class User column, PATCH /auth/me)
 *   - `bio` / `avatar` ↔ server-side user preferences (`preferences.profile`)
 * so the profile follows the user cross-device instead of living in one browser.
 * The session cookie is forwarded by `apiRequest`; an unauthenticated IDE
 * session gets a 401 that the client treats as "no backend account".
 */
type MeResponse = { user?: { name?: string | null } };
type PreferencesResponse = { preferences?: Record<string, unknown> | null };
type ProfilePrefs = { bio?: string; avatar?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const [me, prefs] = await Promise.all([
    apiRequest<MeResponse>(request, '/auth/me', { redirectOn401: false }).catch(() => ({}) as MeResponse),
    apiRequest<PreferencesResponse>(request, '/user/preferences', { redirectOn401: false }).catch(
      () => ({}) as PreferencesResponse,
    ),
  ]);

  const profile = ((prefs.preferences ?? {}) as Record<string, unknown>).profile as ProfilePrefs | undefined;

  return json({
    username: me.user?.name ?? '',
    bio: profile?.bio ?? '',
    avatar: profile?.avatar ?? '',
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'PATCH') {
    const { language } = resolveRequestLocale(request);

    return json(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: translateServerMessage(language, 'errors.methodNotAllowed') },
      { status: 405 },
    );
  }

  let body: { username?: unknown; bio?: unknown; avatar?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, code: 'INVALID_BODY' }, { status: 400 });
  }

  /*
   * The account name is a required, non-empty column. Only forward a username
   * change when it is a non-empty string so an empty field can't 400 the whole
   * save (bio/avatar still persist below).
   */
  if (typeof body.username === 'string' && body.username.trim().length > 0) {
    await apiRequest(request, '/auth/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: body.username.trim() }),
      redirectOn401: false,
    });
  }

  /*
   * bio + avatar live under `preferences.profile`. The API shallow-merges at the
   * top level of `preferences`, so `profile` is REPLACED wholesale on each save
   * — the client always sends the complete {bio, avatar} pair from its store, so
   * a partial edit never drops the other field.
   */
  if (typeof body.bio === 'string' || typeof body.avatar === 'string') {
    const profile: ProfilePrefs = {};

    if (typeof body.bio === 'string') {
      profile.bio = body.bio;
    }

    if (typeof body.avatar === 'string') {
      profile.avatar = body.avatar;
    }

    await apiRequest(request, '/user/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferences: { profile } }),
      redirectOn401: false,
    });
  }

  return json({ ok: true });
}
