import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
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
