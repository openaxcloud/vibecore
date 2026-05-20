import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import {
  createProfileSurfacePage,
  EcodeSurfacePage,
  makeEcodeSurfaceMetaTags,
} from '~/components/marketing/EcodeSurfacePages';

export const meta: MetaFunction = ({ params }) => makeEcodeSurfaceMetaTags(createProfileSurfacePage(params.username));

export default function ProfileSurfaceRoute() {
  const params = useParams();

  return <EcodeSurfacePage page={createProfileSurfacePage(params.username)} />;
}
