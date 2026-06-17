import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
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
