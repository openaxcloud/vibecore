import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createProjectCompatSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createProjectCompatSurfacePage(params.id ?? 'unknown'));

export default function ProjectCompatSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProjectCompatSurfacePage(params.id ?? 'unknown')} />;
}
