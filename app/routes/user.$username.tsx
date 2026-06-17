import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import {
  createUserSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) =>
  makeEcodeSurfaceMetaTags(createUserSurfacePage(params.username ?? 'unknown'));

export default function UserSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createUserSurfacePage(params.username ?? 'unknown')} />;
}
