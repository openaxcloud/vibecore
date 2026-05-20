import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
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
