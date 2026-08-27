import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import {
  createProjectPreviewSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return makeEcodeSurfaceMetaTags(createProjectPreviewSurfacePage(params.projectId ?? '—'), rootData?.language);
};

export default function ProjectPreviewSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProjectPreviewSurfacePage(params.projectId ?? '—')} />;
}
