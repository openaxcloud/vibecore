import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
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
