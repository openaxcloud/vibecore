import { data as json, type ActionFunctionArgs } from 'react-router';
import {
  getFeatureAnnouncements,
  readViewedFeatureIds,
  viewedFeaturesCookie,
} from '~/lib/feature-announcements.server';

export async function action({ request, params }: ActionFunctionArgs) {
  const featureId = params.featureId;

  if (!featureId) {
    return json({ ok: false, error: 'Missing feature id' }, { status: 400 });
  }

  /*
   * Only persist ids that map to a real announcement so the cookie can't be
   * inflated with arbitrary values.
   */
  const known = getFeatureAnnouncements().some((feature) => feature.id === featureId);

  if (!known) {
    return json({ ok: false, error: 'Unknown feature id' }, { status: 404 });
  }

  const viewed = new Set(readViewedFeatureIds(request));
  viewed.add(featureId);

  return json({ ok: true }, { headers: { 'Set-Cookie': viewedFeaturesCookie([...viewed]) } });
}
