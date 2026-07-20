import { redirect, type LoaderFunctionArgs } from 'react-router';
import { IMPORT_HUB_SOURCE_IDS, type ImportHubSourceId } from '~/components/dashboard/ImportHub';

/**
 * Legacy project-scoped import links now enter the canonical Import Hub. The
 * project id is intentionally not forwarded: every Hub import creates a new,
 * isolated project after preflight instead of mutating the project in the URL.
 */
export function loader({ params }: LoaderFunctionArgs) {
  const source = params.source ?? '';

  if (!IMPORT_HUB_SOURCE_IDS.includes(source as ImportHubSourceId)) {
    throw new Response(null, { status: 404 });
  }

  return redirect(`/dashboard/templates?section=import&source=${encodeURIComponent(source)}`);
}

export default function ProjectImportSurfaceRoute() {
  return null;
}
