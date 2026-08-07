import { data as json, type ActionFunctionArgs } from 'react-router';
import {
  getFeatureAnnouncements,
  readViewedFeatureIds,
  viewedFeaturesCookie,
} from '~/lib/feature-announcements.server';
import { featureAnnouncementError } from '~/lib/i18n/catalogs/feature-announcements';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export async function action({ request, params }: ActionFunctionArgs) {
  const locale = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, locale);
  const featureId = params.featureId;

  if (!featureId) {
    return json(
      {
        ok: false,
        error: featureAnnouncementError('FEATURE_ID_REQUIRED', locale.language),
        code: 'FEATURE_ID_REQUIRED',
      },
      { status: 400, headers },
    );
  }

  /*
   * Only persist ids that map to a real announcement so the cookie can't be
   * inflated with arbitrary values.
   */
  const known = getFeatureAnnouncements(locale.language).some((feature) => feature.id === featureId);

  if (!known) {
    return json(
      { ok: false, error: featureAnnouncementError('FEATURE_NOT_FOUND', locale.language), code: 'FEATURE_NOT_FOUND' },
      { status: 404, headers },
    );
  }

  const viewed = new Set(readViewedFeatureIds(request));
  viewed.add(featureId);

  headers.append('Set-Cookie', viewedFeaturesCookie([...viewed]));

  return json({ ok: true }, { headers });
}
