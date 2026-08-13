import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import {
  EcodeAdvancedSurfaceRoute,
  getEcodeAdvancedSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

/*
 * Throw the 404 from the loader so an unknown section produces a true HTTP 404
 * rather than a soft-404 (HTTP 200 "not found" body). See $slug.tsx for the full
 * rationale — a Response thrown in the component cannot change the already-
 * committed document status.
 */
export const loader = ({ params }: LoaderFunctionArgs) => {
  if (!getEcodeAdvancedSurfacePage(params.section ?? '')) {
    throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }

  return null;
};

export const meta: MetaFunction = ({ params }) => {
  const page = getEcodeAdvancedSurfacePage(params.section ?? '');

  return page ? makeEcodeSurfaceMetaTags(page) : [{ title: 'Advanced E-Code surface not found' }];
};

export default function AdvancedEcodeSurfaceRoute() {
  return <EcodeAdvancedSurfaceRoute />;
}
