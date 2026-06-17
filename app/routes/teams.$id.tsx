import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import {
  createTeamSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createTeamSurfacePage(params.id ?? 'unknown'));

export default function TeamSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createTeamSurfacePage(params.id ?? 'unknown')} />;
}
