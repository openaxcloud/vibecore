import { data as json, type LoaderFunctionArgs } from 'react-router';
import { getFeaturesForRequest } from '~/lib/feature-announcements.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return json(getFeaturesForRequest(request));
}
