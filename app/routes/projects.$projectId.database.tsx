import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createProjectDatabaseSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createProjectDatabaseSurfacePage(params.projectId ?? 'unknown'));

export default function ProjectDatabaseSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProjectDatabaseSurfacePage(params.projectId ?? 'unknown')} />;
}
