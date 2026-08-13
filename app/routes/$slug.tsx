import { redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import {
  EcodeSurfacePageBySlug,
  getEcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';
import { hasValidWebSession } from '~/lib/.server/require-session';
import { resolveSurfaceTwin } from '~/lib/surface-twins';

/*
 * The 404 for an unknown surface slug must be thrown from the loader, not the
 * component. A Response thrown during component render renders the ErrorBoundary
 * but cannot change the document's HTTP status — Remix has already committed 200
 * from the loaders by the time the component runs. That produced a soft-404
 * (HTTP 200 body that says "not found"), which search engines index as a real
 * page. Throwing here, before the status is committed, yields a true 404.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const slug = params.slug ?? '';

  if (!getEcodeSurfacePage(slug)) {
    throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }

  // Send a signed-in visitor to the real in-app page instead of the marketing twin.
  const twin = resolveSurfaceTwin(slug);

  if (twin && (await hasValidWebSession(request))) {
    throw redirect(twin);
  }

  return null;
};

export const meta: MetaFunction = ({ params }) => {
  const page = getEcodeSurfacePage(params.slug ?? '');

  return page ? makeEcodeSurfaceMetaTags(page) : [{ title: 'E-Code surface not found' }];
};

export default function EcodeRootSurfaceRoute() {
  return <EcodeSurfacePageBySlug />;
}
