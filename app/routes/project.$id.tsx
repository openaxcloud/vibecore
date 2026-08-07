import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import {
  createProjectCompatSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return makeEcodeSurfaceMetaTags(createProjectCompatSurfacePage(params.id ?? '—'), rootData?.language);
};

export default function ProjectCompatSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProjectCompatSurfacePage(params.id ?? '—')} />;
}
