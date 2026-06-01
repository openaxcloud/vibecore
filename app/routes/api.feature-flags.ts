import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getFeaturesForRequest } from '~/lib/feature-announcements.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return json(getFeaturesForRequest(request));
}
