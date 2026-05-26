import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createProjectImportSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) => {
  const page = createProjectImportSurfacePage(params.projectId ?? 'unknown', params.source ?? '');

  return makeEcodeSurfaceMetaTags(page);
};

export default function ProjectImportSurfaceRoute() {
  const params = useParams();
  const page = createProjectImportSurfacePage(params.projectId ?? 'unknown', params.source ?? '');

  return <EcodeSurfacePage page={page} />;
}
