import { type LoaderFunctionArgs, type MetaFunction, useLoaderData } from 'react-router';
import {
  createProjectImportSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
  PROJECT_IMPORT_SOURCES,
  type ProjectImportSource,
} from '~/components/marketing/EcodeSurfacePages';

/**
 * In-repo SSR project import surface page. Validates the `:source` param against
 * the supported import sources in a loader so unknown sources 404 cleanly —
 * React Router only converts a thrown `Response` into a 404 when it is thrown
 * from a loader/action, never from a component render body or `meta()`. With the
 * source pre-validated here, `createProjectImportSurfacePage` is only ever called
 * with a known-good source and never throws during render or head generation.
 */
export function loader({ params }: LoaderFunctionArgs) {
  const source = params.source ?? '';

  if (!PROJECT_IMPORT_SOURCES.includes(source as ProjectImportSource)) {
    throw new Response(null, { status: 404 });
  }

  return { projectId: params.projectId ?? 'unknown', source: source as ProjectImportSource };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: 'Project Import - E-Code' }];
  }

  return makeEcodeSurfaceMetaTags(createProjectImportSurfacePage(data.projectId, data.source));
};

export default function ProjectImportSurfaceRoute() {
  const { projectId, source } = useLoaderData<typeof loader>();

  return <EcodeSurfacePage page={createProjectImportSurfacePage(projectId, source)} />;
}
