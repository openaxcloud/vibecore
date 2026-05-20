import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createProjectPreviewSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createProjectPreviewSurfacePage(params.projectId ?? 'unknown'));

export default function ProjectPreviewSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProjectPreviewSurfacePage(params.projectId ?? 'unknown')} />;
}
